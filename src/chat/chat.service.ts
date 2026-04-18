import { Injectable, Inject, Logger, BadRequestException, MessageEvent } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Model, Types } from 'mongoose';
import { Subject, Observable } from 'rxjs';
import { randomUUID } from 'crypto';
import { Conversation, ConversationDocument, Message } from './schemas/conversation.schema';
import { GeminiService } from '../gemini/gemini.service';
import { CvProfilesService } from '../cv-profiles/cv-profiles.service';
import { UsersService } from '../users/users.service';
import { JobsService } from '../jobs/jobs.service';
import { ChatResponseDto } from './dto/chat-response.dto';
import { ConversationHistoryResponseDto } from './dto/conversation-history.dto';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  // Constants
  private readonly MAX_HISTORY_MESSAGES = 10;
  private readonly MAX_CONVERSATION_LENGTH = 100;
  private readonly CACHE_TTL_USER_CONTEXT = 300000; // 5 minutes
  private readonly CACHE_PREFIX_CTX = 'chat_ctx:';
  private readonly CACHE_PREFIX_CONV = 'chat_conv:';
  private readonly STREAM_TIMEOUT = 60000; // 60s auto-cleanup

  // Active SSE streams keyed by streamId
  private readonly streams = new Map<string, Subject<MessageEvent>>();

  constructor(
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private geminiService: GeminiService,
    private cvProfilesService: CvProfilesService,
    private usersService: UsersService,
    private jobsService: JobsService,
  ) {}

  async sendMessage(userId: string, message: string): Promise<ChatResponseDto> {
    try {
      this.validateUserId(userId);
      this.logger.log(`Processing message from user ${userId}`);

      // 1. Sanitize user input (prompt injection defense)
      const sanitizedMessage = this.sanitizeUserInput(message);

      // 2. Get or create conversation
      const conversation = await this.getOrCreateConversation(userId);

      // 3. Build user context (includes matching jobs from database)
      const userContext = await this.buildUserContext(userId);

      // 4. Get conversation history (last N messages for context)
      const history = conversation.messages.slice(-this.MAX_HISTORY_MESSAGES);

      // 5. Build system prompt with guardrails and job data
      const systemPrompt = this.buildSystemPrompt(
        userContext,
        (conversation as any).summary,
      );

      // 6. Call Gemini AI — returns guaranteed-valid JSON via native JSON mode
      const parsedResponse = await this.geminiService.chatWithContext(
        sanitizedMessage,
        history,
        systemPrompt,
      );

      // 7. Validate recommended job IDs against actual context (discard hallucinated IDs)
      const validJobIds = new Set(userContext.matchingJobs.map((job: any) => job._id.toString()));
      const validatedJobIds = parsedResponse.recommendedJobIds.filter(id => validJobIds.has(id));

      // 8. Map validated job IDs to full job objects
      const recommendedJobs = userContext.matchingJobs.filter((job: any) =>
        validatedJobIds.includes(job._id.toString()),
      );

      // 9. Save both user message and AI response
      const userMessage: Message = {
        role: 'user',
        content: sanitizedMessage,
        timestamp: new Date(),
      };

      const assistantMessage: Message = {
        role: 'assistant',
        content: parsedResponse.text,
        timestamp: new Date(),
      };

      conversation.messages.push(userMessage, assistantMessage);

      // 10. Auto-generate title from first user message
      if (!(conversation as any).title) {
        (conversation as any).title = sanitizedMessage.slice(0, 80);
      }

      // 11. Check if conversation is getting too long
      if (conversation.messages.length > this.MAX_CONVERSATION_LENGTH) {
        await this.archiveLongConversation(conversation);
      } else {
        await conversation.save();
      }

      // 11. Extract suggested actions
      const suggestedActions = this.extractSuggestedActions(parsedResponse.text, userContext);

      this.logger.log(`Successfully generated AI response for user ${userId}`);

      return {
        conversationId: conversation._id.toString(),
        response: parsedResponse.text,
        timestamp: new Date(),
        suggestedActions: suggestedActions.length > 0 ? suggestedActions : undefined,
        recommendedJobs: recommendedJobs.length > 0 ? recommendedJobs : undefined,
      };
    } catch (error) {
      this.logger.error(`Error sending message for user ${userId}:`, error.stack || error);

      if (error instanceof BadRequestException) {
        throw error;
      }

      if (this.geminiService.isRateLimitError(error)) {
        throw new BadRequestException(
          'AI service is currently busy. Please try again in a few seconds.',
        );
      }

      throw new BadRequestException(
        'Unable to process your message at this time. Please try again later.',
      );
    }
  }

  private sanitizeUserInput(message: string): string {
    let sanitized = message;

    // Strip control characters (keep newlines and tabs for readability)
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Neutralize instruction-like prefixes that attempt to override system prompt
    const injectionPatterns = [
      /^(SYSTEM|ROLE|INSTRUCTION|CONTEXT|PROMPT)\s*:/gi,
      /IGNORE\s+(ALL\s+)?PREVIOUS\s+(INSTRUCTIONS?|PROMPTS?|RULES?)/gi,
      /YOU\s+ARE\s+NOW\s+/gi,
      /DISREGARD\s+(ALL\s+)?(ABOVE|PREVIOUS)/gi,
      /NEW\s+INSTRUCTIONS?\s*:/gi,
      /OVERRIDE\s+(SYSTEM|RULES?|INSTRUCTIONS?)/gi,
    ];

    for (const pattern of injectionPatterns) {
      sanitized = sanitized.replace(pattern, '[filtered] ');
    }

    return sanitized.trim();
  }

  //  Build user context for AI with Redis caching (5-minute TTL)
  private async buildUserContext(userId: string): Promise<any> {
    const cacheKey = `${this.CACHE_PREFIX_CTX}${userId}`;

    // Check cache first
    const cached = await this.cacheManager.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const [user, cvProfile] = await Promise.all([
        this.usersService.findOne(userId).catch(() => null),
        this.cvProfilesService.findByUserId(userId).catch(() => null),
      ]);

      const userSkills = cvProfile?.skills?.map(s => s.name || s) || [];
      const matchingJobs = await this.jobsService.findMatchingJobs(userSkills, 5);

      let appliedJobsCount = 0;
      if (cvProfile && cvProfile.appliedJobs) {
        appliedJobsCount = cvProfile.appliedJobs.length;
      }

      const context = {
        user: user
          ? {
              name: user.name,
              email: user.email,
            }
          : null,
        profile: cvProfile
          ? {
              skills: userSkills,
              experience: cvProfile.experience || [],
              education: cvProfile.education || [],
              summary: cvProfile.summary,
              yearsOfExperience: cvProfile.yearsOfExperience,
            }
          : null,
        matchingJobs,
        appliedJobsCount,
      };

      await this.cacheManager.set(cacheKey, context, this.CACHE_TTL_USER_CONTEXT);
      return context;
    } catch (error) {
      this.logger.warn(`Error building user context for ${userId}:`, error);
      return {
        user: null,
        profile: null,
        matchingJobs: [],
        appliedJobsCount: 0,
      };
    }
  }

  async invalidateUserContext(userId: string): Promise<void> {
    await this.cacheManager.del(`${this.CACHE_PREFIX_CTX}${userId}`);
  }

  private buildSystemPrompt(context: any, conversationSummary?: string): string {
    const jobsData =
      context.matchingJobs?.map((job: any) => ({
        id: job._id.toString(),
        name: job.name,
        company: job.company?.name || 'N/A',
        location: job.location || 'N/A',
        level: job.level || 'N/A',
        skills: job.skills || [],
      })) || [];

    const profileData = context.profile || {};
    const userData = context.user || {};

    let prompt = `ROLE: Expert AI Career Advisor for IT Job Portal (Vietnam).

USER: ${userData.name || 'User'}
PROFILE: ${JSON.stringify(profileData)}
JOBS: ${JSON.stringify(jobsData)}
APPLIED: ${context.appliedJobsCount || 0}`;

    if (conversationSummary) {
      prompt += `\nPREVIOUS CONTEXT: ${conversationSummary}`;
    }

    prompt += `

RULES:
1. SCOPE: Only answer about IT careers, jobs, CVs, interviews, skills, salary in Vietnam IT market. Politely refuse off-topic requests.
2. JOBS: Prioritize recommending jobs from JOBS list above. Include matching job IDs in recommendedJobIds. Never fabricate job listings.
3. ACCURACY: Only reference real data from user profile and provided jobs. Acknowledge missing data honestly.
4. TONE: Professional, encouraging, concise. Match user's language (Vietnamese/English). Use Markdown. Keep under 300 words unless detailed analysis requested.
5. PRIVACY: Never discuss other users' data.`;

    return prompt;
  }

  /**
   * Get conversation history with pagination
   */
  async getConversationHistory(
    userId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<ConversationHistoryResponseDto> {
    try {
      this.validateUserId(userId);
      this.validatePagination(page, limit);

      const conversation = await this.conversationModel
        .findOne({
          userId: new Types.ObjectId(userId),
          isActive: true,
        })
        .lean()
        .exec();

      if (!conversation || !conversation.messages) {
        return {
          messages: [],
          total: 0,
          page,
          limit,
        };
      }

      // Sort messages by timestamp in ascending order (oldest → newest)
      // This ensures consistent ordering with how frontend adds new messages
      const sortedMessages = [...conversation.messages].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      const total = sortedMessages.length;

      // Calculate pagination - most recent messages first (page 1 = newest)
      const endIndex = Math.max(0, total - (page - 1) * limit);
      const startIndex = Math.max(0, endIndex - limit);

      const messages = sortedMessages.slice(startIndex, endIndex);

      return {
        messages,
        total,
        page,
        limit,
        title: (conversation as any).title || undefined,
      };
    } catch (error) {
      this.logger.error(`Error fetching conversation history for user ${userId}:`, error);
      throw new BadRequestException('Failed to fetch conversation history');
    }
  }

  /**
   * Clear conversation by marking as inactive
   */
  async clearConversation(userId: string): Promise<{ message: string }> {
    try {
      this.validateUserId(userId);

      const result = await this.conversationModel.updateOne(
        {
          userId: new Types.ObjectId(userId),
          isActive: true,
        },
        {
          $set: { isActive: false },
        },
      );

      // Invalidate cached conversation ID
      await this.cacheManager.del(`${this.CACHE_PREFIX_CONV}${userId}`);

      if (result.modifiedCount > 0) {
        this.logger.log(`Conversation cleared for user ${userId}`);
      }

      return { message: 'Conversation cleared successfully' };
    } catch (error) {
      this.logger.error(`Error clearing conversation for user ${userId}:`, error);
      throw new BadRequestException('Failed to clear conversation');
    }
  }

  /**
   * Get or create active conversation for user (with Redis-cached conversation ID)
   */
  private async getOrCreateConversation(userId: string): Promise<ConversationDocument> {
    const cacheKey = `${this.CACHE_PREFIX_CONV}${userId}`;

    // Check cache for active conversation ID
    const cachedId = await this.cacheManager.get<string>(cacheKey);
    if (cachedId) {
      const conversation = await this.conversationModel.findById(cachedId).exec();
      if (conversation && conversation.isActive) {
        return conversation;
      }
      // Cached ID is stale, clear it
      await this.cacheManager.del(cacheKey);
    }

    let conversation = await this.conversationModel
      .findOne({
        userId: new Types.ObjectId(userId),
        isActive: true,
      })
      .exec();

    if (!conversation) {
      conversation = await this.conversationModel.create({
        userId: new Types.ObjectId(userId),
        messages: [],
        isActive: true,
      });
      this.logger.log(`Created new conversation for user ${userId}`);
    }

    // Cache the active conversation ID (no expiry — invalidated on clear/archive)
    await this.cacheManager.set(cacheKey, conversation._id.toString(), 0);

    return conversation;
  }

  /**
   * Archive long conversation: generate summary, carry over last 5 messages to new conversation
   */
  private async archiveLongConversation(conversation: ConversationDocument): Promise<void> {
    try {
      // Generate summary of the conversation for long-term context
      const summaryMessages = conversation.messages.map(m => ({
        role: m.role,
        content: m.content,
      }));
      const summary = await this.geminiService
        .summarizeConversation(summaryMessages)
        .catch(() => 'Previous conversation context');

      // Archive the old conversation
      conversation.isActive = false;
      await conversation.save();

      // Carry over last 5 messages for immediate context continuity
      const carryOverMessages = conversation.messages.slice(-5);

      // Create new conversation with summary and carried-over messages
      const newConversation = await this.conversationModel.create({
        userId: conversation.userId,
        messages: carryOverMessages,
        isActive: true,
        summary,
        title: (conversation as any).title || undefined,
      });

      // Update cached conversation ID to point to the new one
      await this.cacheManager.set(
        `${this.CACHE_PREFIX_CONV}${conversation.userId.toString()}`,
        newConversation._id.toString(),
        0,
      );

      this.logger.log(
        `Archived conversation ${conversation._id}, created ${newConversation._id} with summary`,
      );
    } catch (error) {
      this.logger.error('Error archiving conversation:', error);
      await conversation.save();
    }
  }

  /**
   * Extract suggested actions from AI response
   */
  private extractSuggestedActions(aiResponse: string, userContext: any): string[] {
    const actions: string[] = [];

    // Simple keyword-based action extraction
    const lowerResponse = aiResponse.toLowerCase();

    if (!userContext.cvProfile && lowerResponse.includes('cv')) {
      actions.push('Create your CV profile');
    }

    if (userContext.savedJobs?.length === 0 && lowerResponse.includes('job')) {
      actions.push('Browse jobs matching your skills');
    }

    if (lowerResponse.includes('skill') || lowerResponse.includes('learn')) {
      actions.push('Update your skills in CV');
    }

    if (lowerResponse.includes('apply') || lowerResponse.includes('ứng tuyển')) {
      actions.push('View recommended jobs');
    }

    return actions.slice(0, 3); // Max 3 suggestions
  }

  /**
   * Validate user ID format
   */
  private validateUserId(userId: string): void {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }
  }

  /**
   * Validate pagination parameters
   */
  private validatePagination(page: number, limit: number): void {
    if (page < 1) {
      throw new BadRequestException('Page must be greater than 0');
    }
    if (limit < 1 || limit > 100) {
      throw new BadRequestException('Limit must be between 1 and 100');
    }
  }

  // SSE Streaming

  async initiateStream(userId: string, message: string): Promise<string> {
    this.validateUserId(userId);

    const streamId = randomUUID();
    const subject = new Subject<MessageEvent>();
    this.streams.set(streamId, subject);

    // Start streaming in background (fire-and-forget)
    this.processStream(userId, message, subject, streamId).catch(err => {
      this.logger.error(`Stream ${streamId} failed:`, err.stack || err);
      subject.next({ data: 'Stream processing failed' } as MessageEvent);
      subject.complete();
      this.streams.delete(streamId);
    });

    // Auto-cleanup after timeout (prevents memory leaks from abandoned streams)
    setTimeout(() => {
      if (this.streams.has(streamId)) {
        this.streams.delete(streamId);
        if (!subject.closed) subject.complete();
      }
    }, this.STREAM_TIMEOUT);

    return streamId;
  }

  /**
   * Get the Observable for an active stream (used by SSE GET endpoint)
   */
  getStream(streamId: string): Observable<MessageEvent> | null {
    const subject = this.streams.get(streamId);
    return subject ? subject.asObservable() : null;
  }

  /**
   * Process the streaming chat response in the background
   */
  private async processStream(
    userId: string,
    message: string,
    subject: Subject<MessageEvent>,
    streamId: string,
  ): Promise<void> {
    const sanitizedMessage = this.sanitizeUserInput(message);
    const conversation = await this.getOrCreateConversation(userId);
    const userContext = await this.buildUserContext(userId);
    const history = conversation.messages.slice(-this.MAX_HISTORY_MESSAGES);
    const systemPrompt = this.buildSystemPrompt(userContext, (conversation as any).summary);

    let fullText = '';
    let eventId = 0;

    // Stream text chunks
    for await (const chunk of this.geminiService.chatWithContextStream(
      sanitizedMessage,
      history,
      systemPrompt,
    )) {
      fullText += chunk;
      subject.next({ data: chunk, type: 'token', id: String(++eventId) } as MessageEvent);
    }

    // Match recommended jobs from response text against context
    const recommendedJobs = userContext.matchingJobs.filter(
      (job: any) =>
        fullText.toLowerCase().includes(job.name.toLowerCase()) ||
        fullText.includes(job._id.toString()),
    );

    // Save conversation
    const userMessage: Message = {
      role: 'user',
      content: sanitizedMessage,
      timestamp: new Date(),
    };
    const assistantMessage: Message = {
      role: 'assistant',
      content: fullText,
      timestamp: new Date(),
    };
    conversation.messages.push(userMessage, assistantMessage);

    // Auto-generate title from first user message
    if (!(conversation as any).title) {
      (conversation as any).title = sanitizedMessage.slice(0, 80);
    }

    if (conversation.messages.length > this.MAX_CONVERSATION_LENGTH) {
      await this.archiveLongConversation(conversation);
    } else {
      await conversation.save();
    }

    // Send final "done" event with metadata
    const donePayload = {
      conversationId: conversation._id.toString(),
      recommendedJobs: recommendedJobs.length > 0 ? recommendedJobs : undefined,
      suggestedActions: this.extractSuggestedActions(fullText, userContext),
    };
    subject.next({
      data: JSON.stringify(donePayload),
      type: 'done',
      id: String(++eventId),
    } as MessageEvent);

    subject.complete();
    this.streams.delete(streamId);
    this.logger.log(`Stream ${streamId} completed for user ${userId}`);
  }
}
