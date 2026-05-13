import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { InjectModel } from '@nestjs/mongoose';
import { Cache } from 'cache-manager';
import { Model, Types } from 'mongoose';
import { IAIChatUsageMetadata } from 'src/ai/interfaces/ai-chat-usage-metadata.interface';
import { Conversation, ConversationDocument, Message } from './schemas/conversation.schema';
import { AIService } from '../ai/ai.service';
import { ChatResponseDto } from './dto/chat-response.dto';
import { ConversationHistoryResponseDto } from './dto/conversation-history.dto';
import { ChatRecommendedJobDto } from './dto/chat-recommended-job.dto';
import { ChatContextService } from './chat-context.service';
import { ChatPromptBuilder } from './chat-prompt.builder';
import { JobsService } from '../jobs/jobs.service';
import { UserContext } from './interfaces/chat-context.interface';
import {
  ChatGuardrailBlockedException,
  ChatGuardrailService,
} from './chat-guardrail.service';
import { AiUsageService } from './ai-usage.service';
import { TooManyRequestsException } from './exceptions/too-many-requests.exception';

export interface ChatStreamEvent {
  type: 'token' | 'done';
  data: string | Record<string, unknown>;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  private readonly MAX_HISTORY_MESSAGES = 10;
  private readonly MAX_CONVERSATION_LENGTH = 100;
  private readonly CACHE_PREFIX_CONV = 'chat_conv:';

  constructor(
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private aiService: AIService,
    private chatContextService: ChatContextService,
    private chatPromptBuilder: ChatPromptBuilder,
    private jobsService: JobsService,
    private chatGuardrailService: ChatGuardrailService,
    private aiUsageService: AiUsageService,
  ) {}

  async sendMessage(userId: string, message: string): Promise<ChatResponseDto> {
    const startedAt = Date.now();
    let conversationId: string | undefined;
    let guardrailFlags: string[] = [];
    let promptEstimateSource = message;

    try {
      this.validateUserId(userId);
      this.logger.log(`Processing message from user ${userId}`);

      const guardrail = this.chatGuardrailService.validateMessage(message);
      guardrailFlags = guardrail.flags;
      const sanitizedMessage = guardrail.sanitizedMessage;
      promptEstimateSource = sanitizedMessage;

      const conversation = await this.getOrCreateConversation(userId);
      conversationId = conversation._id.toString();

      const fullContext = await this.chatContextService.buildFullContext(userId, sanitizedMessage);
      const history = conversation.messages.slice(-this.MAX_HISTORY_MESSAGES);
      const systemPrompt = this.chatPromptBuilder.buildSystemPrompt(
        fullContext,
        (conversation as any).summary,
      );
      promptEstimateSource = this.buildPromptEstimateSource(systemPrompt, history, sanitizedMessage);

      const parsedResponse = await this.aiService.generateChat(
        sanitizedMessage,
        history,
        systemPrompt,
      );

      const allContextJobs = [
        ...fullContext.user.matchingJobs,
        ...fullContext.queryAware.detectedJobs,
      ];
      const validJobIds = new Set(allContextJobs.map((job: any) => job._id.toString()));
      const validatedJobIds = (parsedResponse.recommendedJobIds ?? []).filter(id =>
        validJobIds.has(id),
      );
      const recommendedJobs = this.buildRecommendedJobsFromIds(validatedJobIds, allContextJobs);

      const userMessage: Message = {
        role: 'user',
        content: sanitizedMessage,
        timestamp: new Date(),
      };

      const assistantMessage: Message = {
        role: 'assistant',
        content: parsedResponse.text,
        timestamp: new Date(),
        recommendedJobIds: validatedJobIds.length > 0 ? validatedJobIds : undefined,
      };

      conversation.messages.push(userMessage, assistantMessage);

      if (!(conversation as any).title) {
        (conversation as any).title = sanitizedMessage.slice(0, 80);
      }

      if (conversation.messages.length > this.MAX_CONVERSATION_LENGTH) {
        await this.archiveLongConversation(conversation);
      } else {
        await conversation.save();
      }

      const suggestedActions = this.extractSuggestedActions(parsedResponse.text, fullContext.user);
      await this.recordUsage({
        userId,
        conversationId,
        operationType: 'chat_message',
        success: true,
        metadata: this.withEstimatedUsage(
          parsedResponse.metadata,
          promptEstimateSource,
          Date.now() - startedAt,
        ),
        fallbackUsed: parsedResponse.fallbackUsed,
        guardrailFlags,
      });

      this.logger.log(`Successfully generated AI response for user ${userId}`);

      return {
        conversationId,
        response: parsedResponse.text,
        timestamp: new Date(),
        suggestedActions: suggestedActions.length > 0 ? suggestedActions : undefined,
        recommendedJobIds: validatedJobIds.length > 0 ? validatedJobIds : undefined,
        recommendedJobs: recommendedJobs.length > 0 ? recommendedJobs : undefined,
      };
    } catch (error) {
      guardrailFlags = this.resolveGuardrailFlags(error, guardrailFlags);
      await this.recordUsage({
        userId,
        conversationId,
        operationType: 'chat_message',
        success: false,
        metadata: this.withEstimatedUsage(undefined, promptEstimateSource, Date.now() - startedAt),
        guardrailFlags,
        errorCategory: this.categorizeError(error),
      });

      const errorDetails = error instanceof Error ? (error.stack ?? error.message) : error;
      this.logger.error(`Error sending message for user ${userId}:`, errorDetails);
      throw this.mapChatError(error);
    }
  }

  async *streamMessage(userId: string, message: string): AsyncGenerator<ChatStreamEvent> {
    const startedAt = Date.now();
    let conversationId: string | undefined;
    let guardrailFlags: string[] = [];
    let promptEstimateSource = message;
    let fullText = '';

    try {
      this.validateUserId(userId);

      const guardrail = this.chatGuardrailService.validateMessage(message);
      guardrailFlags = guardrail.flags;
      const sanitizedMessage = guardrail.sanitizedMessage;
      promptEstimateSource = sanitizedMessage;

      const conversation = await this.getOrCreateConversation(userId);
      conversationId = conversation._id.toString();

      const fullContext = await this.chatContextService.buildFullContext(userId, sanitizedMessage);
      const history = conversation.messages.slice(-this.MAX_HISTORY_MESSAGES);
      const systemPrompt = this.chatPromptBuilder.buildSystemPrompt(
        fullContext,
        (conversation as any).summary,
      );
      promptEstimateSource = this.buildPromptEstimateSource(systemPrompt, history, sanitizedMessage);

      const allContextJobs = [
        ...fullContext.user.matchingJobs,
        ...fullContext.queryAware.detectedJobs,
      ];
      const validJobIds = new Set(allContextJobs.map((job: any) => job._id.toString()));

      const gen = this.aiService.streamChat(sanitizedMessage, history, systemPrompt);
      let iterResult = await gen.next();

      while (!iterResult.done) {
        const chunk = iterResult.value as string;
        fullText += chunk;
        yield { type: 'token', data: chunk };
        iterResult = await gen.next();
      }

      const streamResult = iterResult.value;
      const rawJobIds = streamResult?.recommendedJobIds ?? [];
      const validatedJobIds = [...new Set(rawJobIds.filter(jobId => validJobIds.has(jobId)))];
      const recommendedJobs = this.buildRecommendedJobsFromIds(validatedJobIds, allContextJobs);

      const userMessage: Message = {
        role: 'user',
        content: sanitizedMessage,
        timestamp: new Date(),
      };
      const assistantMessage: Message = {
        role: 'assistant',
        content: fullText,
        timestamp: new Date(),
        recommendedJobIds: validatedJobIds.length > 0 ? validatedJobIds : undefined,
      };
      conversation.messages.push(userMessage, assistantMessage);

      if (!(conversation as any).title) {
        (conversation as any).title = sanitizedMessage.slice(0, 80);
      }

      if (conversation.messages.length > this.MAX_CONVERSATION_LENGTH) {
        await this.archiveLongConversation(conversation);
      } else {
        await conversation.save();
      }

      await this.recordUsage({
        userId,
        conversationId,
        operationType: 'chat_stream',
        success: true,
        metadata: this.withEstimatedUsage(
          streamResult?.metadata,
          promptEstimateSource,
          Date.now() - startedAt,
        ),
        fallbackUsed: streamResult?.fallbackUsed,
        guardrailFlags,
      });

      const suggestedActions = this.extractSuggestedActions(fullText, fullContext.user);

      yield {
        type: 'done',
        data: {
          conversationId,
          recommendedJobIds: validatedJobIds.length > 0 ? validatedJobIds : undefined,
          recommendedJobs: recommendedJobs.length > 0 ? recommendedJobs : undefined,
          suggestedActions: suggestedActions.length > 0 ? suggestedActions : undefined,
        },
      };

      this.logger.log(`Streaming message completed for user ${userId}`);
    } catch (error) {
      guardrailFlags = this.resolveGuardrailFlags(error, guardrailFlags);
      await this.recordUsage({
        userId,
        conversationId,
        operationType: 'chat_stream',
        success: false,
        metadata: this.withEstimatedUsage(undefined, promptEstimateSource, Date.now() - startedAt),
        guardrailFlags,
        errorCategory: this.categorizeError(error),
      });

      const errorDetails = error instanceof Error ? (error.stack ?? error.message) : error;
      this.logger.error(`Error streaming message for user ${userId}:`, errorDetails);
      throw this.mapChatError(error);
    }
  }

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

      const sortedMessages = [...conversation.messages].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      const total = sortedMessages.length;
      const endIndex = Math.max(0, total - (page - 1) * limit);
      const startIndex = Math.max(0, endIndex - limit);

      const messages = sortedMessages.slice(startIndex, endIndex);
      const hydratedMessages = await this.hydrateRecommendedJobs(messages);

      return {
        messages: hydratedMessages,
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

  private async getOrCreateConversation(userId: string): Promise<ConversationDocument> {
    const cacheKey = `${this.CACHE_PREFIX_CONV}${userId}`;

    const cachedId = await this.cacheManager.get<string>(cacheKey);
    if (cachedId) {
      const conversation = await this.conversationModel.findById(cachedId).exec();
      if (conversation && conversation.isActive) {
        return conversation;
      }
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

    await this.cacheManager.set(cacheKey, conversation._id.toString(), 0);

    return conversation;
  }

  private async archiveLongConversation(conversation: ConversationDocument): Promise<void> {
    try {
      const summaryMessages = conversation.messages.map(m => ({
        role: m.role,
        content: m.content,
      }));
      const summary = await this.aiService
        .summarizeConversation(summaryMessages)
        .catch(() => 'Previous conversation context');

      conversation.isActive = false;
      await conversation.save();

      const carryOverMessages = conversation.messages.slice(-5);
      const newConversation = await this.conversationModel.create({
        userId: conversation.userId,
        messages: carryOverMessages,
        isActive: true,
        summary,
        title: (conversation as any).title || undefined,
      });

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

  private extractSuggestedActions(aiResponse: string, userContext: UserContext): string[] {
    const actions: string[] = [];
    const lowerResponse = aiResponse.toLowerCase();

    if (!userContext.profile && lowerResponse.includes('cv')) {
      actions.push('Create your CV profile');
    }

    if (userContext.matchingJobs.length === 0 && lowerResponse.includes('job')) {
      actions.push('Browse jobs matching your skills');
    }

    if (lowerResponse.includes('skill') || lowerResponse.includes('learn')) {
      actions.push('Update your skills in CV');
    }

    if (lowerResponse.includes('apply') || lowerResponse.includes('ứng tuyển')) {
      actions.push('View recommended jobs');
    }

    return actions.slice(0, 3);
  }

  private validateUserId(userId: string): void {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID format');
    }
  }

  private validatePagination(page: number, limit: number): void {
    if (page < 1) {
      throw new BadRequestException('Page must be greater than 0');
    }
    if (limit < 1 || limit > 100) {
      throw new BadRequestException('Limit must be between 1 and 100');
    }
  }

  private async hydrateRecommendedJobs(messages: Message[]): Promise<Message[]> {
    const uniqueRecommendedJobIds = [
      ...new Set(messages.flatMap(message => message.recommendedJobIds ?? [])),
    ];

    if (uniqueRecommendedJobIds.length === 0) {
      return messages;
    }

    const recommendedJobs =
      await this.jobsService.findPublicChatCardJobsByIds(uniqueRecommendedJobIds);
    const recommendedJobMap = new Map<string, ChatRecommendedJobDto>(
      recommendedJobs.map(job => {
        const serializedJob = this.serializeRecommendedJob(job);
        return [serializedJob._id, serializedJob];
      }),
    );

    return messages.map(message => {
      if (!message.recommendedJobIds?.length) {
        return message;
      }

      const hydratedRecommendedJobs = this.mapRecommendedJobsByIds(
        message.recommendedJobIds,
        recommendedJobMap,
      );

      return hydratedRecommendedJobs.length > 0
        ? {
            ...message,
            recommendedJobs: hydratedRecommendedJobs,
          }
        : { ...message };
    });
  }

  private buildRecommendedJobsFromIds(
    recommendedJobIds: string[],
    jobs: Array<Record<string, any>>,
  ): ChatRecommendedJobDto[] {
    const recommendedJobMap = new Map<string, ChatRecommendedJobDto>(
      jobs.map(job => {
        const serializedJob = this.serializeRecommendedJob(job);
        return [serializedJob._id, serializedJob];
      }),
    );

    return this.mapRecommendedJobsByIds(recommendedJobIds, recommendedJobMap);
  }

  private mapRecommendedJobsByIds(
    recommendedJobIds: string[],
    recommendedJobMap: Map<string, ChatRecommendedJobDto>,
  ): ChatRecommendedJobDto[] {
    const seenIds = new Set<string>();

    return recommendedJobIds.reduce<ChatRecommendedJobDto[]>((result, jobId) => {
      if (seenIds.has(jobId)) {
        return result;
      }

      const recommendedJob = recommendedJobMap.get(jobId);
      if (!recommendedJob) {
        return result;
      }

      seenIds.add(jobId);
      result.push(recommendedJob);
      return result;
    }, []);
  }

  private serializeRecommendedJob(job: Record<string, any>): ChatRecommendedJobDto {
    const companyId = job.company?._id?.toString?.() ?? String(job.company?._id ?? '');

    return {
      _id: job._id?.toString?.() ?? String(job._id ?? ''),
      name: job.name ?? '',
      company: {
        _id: companyId,
        name: job.company?.name ?? '',
        ...(job.company?.logo ? { logo: job.company.logo } : {}),
      },
      location: job.location ?? '',
      ...(job.locationCode ? { locationCode: job.locationCode } : {}),
      skills: Array.isArray(job.skills) ? job.skills : [],
      level: job.level ?? '',
      ...(typeof job.salary === 'number' ? { salary: job.salary } : {}),
    };
  }

  private buildPromptEstimateSource(
    systemPrompt: string,
    history: Message[],
    message: string,
  ): string {
    const historyText = history.map(item => `${item.role}: ${item.content}`).join('\n');
    return `${systemPrompt}\n${historyText}\n${message}`;
  }

  private withEstimatedUsage(
    metadata: IAIChatUsageMetadata | undefined,
    promptSource: string,
    latencyMs: number,
  ): IAIChatUsageMetadata {
    const shouldEstimatePromptTokens = !metadata?.promptTokens && !metadata?.estimatedPromptTokens;

    return {
      ...metadata,
      estimatedPromptTokens: shouldEstimatePromptTokens
        ? this.aiService.estimateTokens(promptSource)
        : metadata?.estimatedPromptTokens,
      latencyMs: metadata?.latencyMs ?? latencyMs,
    } as IAIChatUsageMetadata;
  }

  private async recordUsage(input: {
    userId: string;
    conversationId?: string;
    operationType: string;
    success: boolean;
    metadata?: IAIChatUsageMetadata;
    fallbackUsed?: boolean;
    guardrailFlags?: string[];
    errorCategory?: string;
  }): Promise<void> {
    if (!Types.ObjectId.isValid(input.userId)) {
      return;
    }

    await this.aiUsageService.record(input);
  }

  private resolveGuardrailFlags(error: unknown, currentFlags: string[]): string[] {
    if (error instanceof ChatGuardrailBlockedException) {
      return error.flags;
    }

    return currentFlags;
  }

  private categorizeError(error: unknown): string {
    if (error instanceof ChatGuardrailBlockedException) {
      return 'GUARDRAIL_BLOCKED';
    }

    if (this.aiService.isRateLimitError(error)) {
      return 'RATE_LIMIT';
    }

    if (this.aiService.isServiceUnavailableError(error)) {
      return 'SERVICE_UNAVAILABLE';
    }

    if (error instanceof BadRequestException) {
      return 'BAD_REQUEST';
    }

    return 'UNKNOWN';
  }

  private mapChatError(error: unknown): Error {
    if (error instanceof BadRequestException) {
      return error;
    }

    if (this.aiService.isRateLimitError(error)) {
      return new TooManyRequestsException(
        'AI service is currently busy. Please try again in a few seconds.',
      );
    }

    if (this.aiService.isServiceUnavailableError(error)) {
      return new ServiceUnavailableException(
        'The chatbot is currently unavailable. Please try again later.',
      );
    }

    return new BadRequestException(
      'Unable to process your message at this time. Please try again later.',
    );
  }
}
