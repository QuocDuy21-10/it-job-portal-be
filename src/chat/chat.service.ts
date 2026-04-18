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
import { CompaniesService } from '../companies/companies.service';
import { ChatResponseDto } from './dto/chat-response.dto';
import { ConversationHistoryResponseDto } from './dto/conversation-history.dto';
import {
  PlatformContext,
  UserContext,
  QueryAwareContext,
  FullChatContext,
} from './interfaces/chat-context.interface';
import { SKILL_VARIATIONS } from '../matching/constants/matching.constants';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  // Constants
  private readonly MAX_HISTORY_MESSAGES = 10;
  private readonly MAX_CONVERSATION_LENGTH = 100;
  private readonly CACHE_TTL_USER_CONTEXT = 300000; // 5 minutes
  private readonly CACHE_TTL_PLATFORM_CONTEXT = 1800000; // 30 minutes
  private readonly CACHE_PREFIX_CTX = 'chat_ctx:';
  private readonly CACHE_PREFIX_CONV = 'chat_conv:';
  private readonly CACHE_KEY_PLATFORM = 'chat_platform_ctx';
  private readonly STREAM_TIMEOUT = 60000; // 60s auto-cleanup

  // Stats keywords for Vietnamese + English
  private readonly STATS_KEYWORDS = [
    'how many',
    'bao nhiêu',
    'statistics',
    'thống kê',
    'tổng số',
    'total',
    'count',
    'số lượng',
  ];

  // Active SSE streams keyed by streamId
  private readonly streams = new Map<string, Subject<MessageEvent>>();

  // Precomputed skill lookup set (built once from SKILL_VARIATIONS)
  private readonly knownSkills: Set<string>;

  constructor(
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private geminiService: GeminiService,
    private cvProfilesService: CvProfilesService,
    private usersService: UsersService,
    private jobsService: JobsService,
    private companiesService: CompaniesService,
  ) {
    // Build the known skills set from skill variations for fast lookup
    this.knownSkills = new Set<string>();
    for (const [key, aliases] of Object.entries(SKILL_VARIATIONS)) {
      this.knownSkills.add(key.toLowerCase());
      aliases.forEach(alias => this.knownSkills.add(alias.toLowerCase()));
    }
  }

  async sendMessage(userId: string, message: string): Promise<ChatResponseDto> {
    try {
      this.validateUserId(userId);
      this.logger.log(`Processing message from user ${userId}`);

      // 1. Sanitize user input (prompt injection defense)
      const sanitizedMessage = this.sanitizeUserInput(message);

      // 2. Get or create conversation
      const conversation = await this.getOrCreateConversation(userId);

      // 3. Build full context (platform + user + query-aware)
      const fullContext = await this.buildFullContext(userId, sanitizedMessage);

      // 4. Get conversation history (last N messages for context)
      const history = conversation.messages.slice(-this.MAX_HISTORY_MESSAGES);

      // 5. Build system prompt with guardrails and all context layers
      const systemPrompt = this.buildSystemPrompt(fullContext, (conversation as any).summary);

      // 6. Call Gemini AI — returns guaranteed-valid JSON via native JSON mode
      const parsedResponse = await this.geminiService.chatWithContext(
        sanitizedMessage,
        history,
        systemPrompt,
      );

      // 7. Validate recommended job IDs against all known jobs in context
      const allContextJobs = [
        ...fullContext.user.matchingJobs,
        ...fullContext.queryAware.detectedJobs,
      ];
      const validJobIds = new Set(allContextJobs.map((job: any) => job._id.toString()));
      const validatedJobIds = parsedResponse.recommendedJobIds.filter(id => validJobIds.has(id));

      // 8. Map validated job IDs to full job objects (deduplicated)
      const seenIds = new Set<string>();
      const recommendedJobs = allContextJobs.filter((job: any) => {
        const jobId = job._id.toString();
        if (validatedJobIds.includes(jobId) && !seenIds.has(jobId)) {
          seenIds.add(jobId);
          return true;
        }
        return false;
      });

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
      const suggestedActions = this.extractSuggestedActions(parsedResponse.text, fullContext.user);

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

  //  Build full context merging platform, user, and query-aware layers
  private async buildFullContext(userId: string, message: string): Promise<FullChatContext> {
    const [platform, user] = await Promise.all([
      this.buildPlatformContext(),
      this.buildUserContext(userId),
    ]);

    const queryAware = await this.buildQueryAwareContext(message, platform);

    return { platform, user, queryAware };
  }

  /**
   * Build platform-wide context (shared across all users, 30-min cache)
   */
  private async buildPlatformContext(): Promise<PlatformContext> {
    const cached = await this.cacheManager.get<PlatformContext>(this.CACHE_KEY_PLATFORM);
    if (cached) return cached;

    try {
      const stats = await this.jobsService.getPlatformJobStats();
      await this.cacheManager.set(this.CACHE_KEY_PLATFORM, stats, this.CACHE_TTL_PLATFORM_CONTEXT);
      return stats;
    } catch (error) {
      this.logger.warn('Error building platform context:', error);
      return {
        activeJobCount: 0,
        hiringCompaniesCount: 0,
        topSkills: [],
        topCompanies: [],
        jobsByLevel: [],
      };
    }
  }

  //  Build user-specific context with Redis caching (5-minute TTL)
  private async buildUserContext(userId: string): Promise<UserContext> {
    const cacheKey = `${this.CACHE_PREFIX_CTX}${userId}`;

    const cached = await this.cacheManager.get<UserContext>(cacheKey);
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

      const context: UserContext = {
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

  private async buildQueryAwareContext(
    message: string,
    platform: PlatformContext,
  ): Promise<QueryAwareContext> {
    const result: QueryAwareContext = {
      detectedJobs: [],
      detectedCompanies: [],
      includeStats: false,
    };

    const lowerMessage = message.toLowerCase();

    // 1. Detect stats keywords
    result.includeStats = this.STATS_KEYWORDS.some(kw => lowerMessage.includes(kw));

    // 2. Detect skill names from message
    const detectedSkills = this.detectSkillsInMessage(lowerMessage, platform);

    // 3. Detect company names from message
    const detectedCompanyNames = this.detectCompaniesInMessage(lowerMessage, platform);

    // Fetch data in parallel
    const promises: Promise<void>[] = [];

    if (detectedSkills.length > 0) {
      promises.push(
        this.jobsService
          .searchJobs(detectedSkills, undefined, undefined, 10)
          .then(jobs => {
            result.detectedJobs = jobs;
          })
          .catch(err => {
            this.logger.warn('Error fetching jobs for detected skills:', err);
          }),
      );
    }

    if (detectedCompanyNames.length > 0) {
      for (const name of detectedCompanyNames.slice(0, 3)) {
        promises.push(
          this.companiesService
            .findByName(name, 2)
            .then(companies => {
              result.detectedCompanies.push(...companies);
            })
            .catch(err => {
              this.logger.warn(`Error fetching company "${name}":`, err);
            }),
        );
      }
    }

    await Promise.all(promises);
    return result;
  }

  private detectSkillsInMessage(lowerMessage: string, platform: PlatformContext): string[] {
    const detected = new Set<string>();

    // Check against platform top skills
    for (const skill of platform.topSkills) {
      if (lowerMessage.includes(skill.name.toLowerCase())) {
        detected.add(skill.name);
      }
    }

    // Check against known skills from SKILL_VARIATIONS
    // Use word boundary matching for short skill names to avoid false positives
    const words = lowerMessage.split(/[\s,;.!?]+/).filter(w => w.length >= 1);
    for (const word of words) {
      if (this.knownSkills.has(word)) {
        detected.add(word);
      }
    }

    // Also check multi-word patterns (e.g., "react native", "node.js", "machine learning")
    for (const [key, aliases] of Object.entries(SKILL_VARIATIONS)) {
      if (lowerMessage.includes(key)) {
        detected.add(key);
      }
      for (const alias of aliases) {
        if (lowerMessage.includes(alias)) {
          detected.add(key); // Normalize to canonical name
        }
      }
    }

    return [...detected];
  }

  private detectCompaniesInMessage(lowerMessage: string, platform: PlatformContext): string[] {
    const detected: string[] = [];

    for (const company of platform.topCompanies) {
      if (company.name && lowerMessage.includes(company.name.toLowerCase())) {
        detected.push(company.name);
      }
    }

    return detected;
  }

  async invalidateUserContext(userId: string): Promise<void> {
    await this.cacheManager.del(`${this.CACHE_PREFIX_CTX}${userId}`);
  }

  private buildSystemPrompt(context: FullChatContext, conversationSummary?: string): string {
    const { platform, user: userCtx, queryAware } = context;

    // Personal matching jobs
    const jobsData =
      userCtx.matchingJobs?.map((job: any) => ({
        id: job._id.toString(),
        name: job.name,
        company: job.company?.name || 'N/A',
        location: job.location || 'N/A',
        level: job.level || 'N/A',
        skills: job.skills || [],
      })) || [];

    const profileData = userCtx.profile || {};
    const userName = userCtx.user?.name || 'User';

    // --- Build prompt ---

    let prompt = `ROLE: Expert AI Career Advisor for IT Job Portal (Vietnam).

USER: ${userName}
PROFILE: ${JSON.stringify(profileData)}`;

    // Layer 1: Platform context (always included)
    prompt += `

PLATFORM:
- Active jobs: ${platform.activeJobCount}
- Hiring companies: ${platform.hiringCompaniesCount}
- Top skills: ${platform.topSkills.map(s => `${s.name} (${s.count})`).join(', ') || 'N/A'}
- Top companies: ${platform.topCompanies.map(c => `${c.name} (${c.jobCount} jobs)`).join(', ') || 'N/A'}
- Jobs by level: ${platform.jobsByLevel.map(l => `${l.level}: ${l.count}`).join(', ') || 'N/A'}`;

    // Layer 2: Personal matching jobs
    if (jobsData.length > 0) {
      prompt += `\nYOUR MATCHING JOBS: ${JSON.stringify(jobsData)}`;
    }
    prompt += `\nAPPLIED: ${userCtx.appliedJobsCount || 0}`;

    // Layer 3: Query-aware context
    if (queryAware.detectedJobs.length > 0) {
      const searchJobs = queryAware.detectedJobs.map((job: any) => ({
        id: job._id.toString(),
        name: job.name,
        company: job.company?.name || 'N/A',
        location: job.location || 'N/A',
        level: job.level || 'N/A',
        skills: job.skills || [],
        salary: job.salary || 'N/A',
      }));
      prompt += `\nSEARCH RESULTS: ${JSON.stringify(searchJobs)}`;
    }

    if (queryAware.detectedCompanies.length > 0) {
      const companyInfo = queryAware.detectedCompanies.map(c => ({
        name: c.name,
        address: c.address,
        description: c.description,
        activeJobs: c.jobCount,
      }));
      prompt += `\nCOMPANY INFO: ${JSON.stringify(companyInfo)}`;
    }

    if (conversationSummary) {
      prompt += `\nPREVIOUS CONTEXT: ${conversationSummary}`;
    }

    prompt += `

RULES:
1. SCOPE: Only answer about IT careers, jobs, CVs, interviews, skills, salary in Vietnam IT market. Politely refuse off-topic requests.
2. JOBS: Recommend jobs from YOUR MATCHING JOBS and SEARCH RESULTS. Include matching job IDs in recommendedJobIds. Never fabricate job listings.
3. PLATFORM: Use PLATFORM data to answer general questions about job market stats, available skills, hiring trends, and company counts.
4. COMPANIES: Use COMPANY INFO to answer questions about specific companies. If company data is available, reference it. If not, acknowledge you don't have info about that company.
5. ACCURACY: Only reference real data from user profile, provided jobs, and platform data. Acknowledge missing data honestly.
6. TONE: Professional, encouraging, concise. Match user's language (Vietnamese/English). Use Markdown. Keep under 300 words unless detailed analysis requested.
7. PRIVACY: Never discuss other users' data.`;

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
    const fullContext = await this.buildFullContext(userId, sanitizedMessage);
    const history = conversation.messages.slice(-this.MAX_HISTORY_MESSAGES);
    const systemPrompt = this.buildSystemPrompt(fullContext, (conversation as any).summary);

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

    // Match recommended jobs from response text against all context jobs
    const allContextJobs = [
      ...fullContext.user.matchingJobs,
      ...fullContext.queryAware.detectedJobs,
    ];
    const seenIds = new Set<string>();
    const recommendedJobs = allContextJobs.filter((job: any) => {
      const jobId = job._id.toString();
      if (seenIds.has(jobId)) return false;
      const matches =
        fullText.toLowerCase().includes(job.name.toLowerCase()) || fullText.includes(jobId);
      if (matches) seenIds.add(jobId);
      return matches;
    });

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
      suggestedActions: this.extractSuggestedActions(fullText, fullContext.user),
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
