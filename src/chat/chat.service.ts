import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { InjectModel } from '@nestjs/mongoose';
import { Cache } from 'cache-manager';
import { Model, Types } from 'mongoose';
import { IAIChatMessage } from 'src/ai/interfaces/ai-chat-message.interface';
import { IAIChatUsageMetadata } from 'src/ai/interfaces/ai-chat-usage-metadata.interface';
import { IUser } from 'src/users/user.interface';
import { ChatSession, ChatSessionDocument } from './schemas/chat-session.schema';
import { ChatMessage, ChatMessageDocument } from './schemas/chat-message.schema';
import { AIService } from '../ai/ai.service';
import { ChatResponseDto } from './dto/chat-response.dto';
import { ConversationHistoryResponseDto, MessageDto } from './dto/conversation-history.dto';
import { ChatRecommendedJobDto } from './dto/chat-recommended-job.dto';
import { ChatPromptBuilder } from './chat-prompt.builder';
import { JobsService } from '../jobs/jobs.service';
import { IntentAwareChatContext, UserContext } from './interfaces/chat-context.interface';
import { ChatGuardrailBlockedException, ChatGuardrailService } from './chat-guardrail.service';
import { AiUsageService } from './ai-usage.service';
import {
  ChatQuotaExceededException,
  TooManyRequestsException,
} from './exceptions/too-many-requests.exception';
import { EChatMessageRole } from './enums/chat-message-role.enum';
import { EChatSessionType } from './enums/chat-session-type.enum';
import { CreateChatSessionDto } from './dto/create-chat-session.dto';
import { ChatSessionDto, ChatSessionListResponseDto } from './dto/chat-session.dto';
import { IChatMessageMetadata } from './interfaces/chat-message-metadata.interface';
import { EChatIntent } from './enums/chat-intent.enum';
import { ChatIntentDetectionSource } from './interfaces/chat-intent-result.interface';
import { ChatIntentService } from './chat-intent.service';
import { ChatContextProviderRegistry } from './chat-context-provider.registry';
import { ChatQuotaService } from './chat-quota.service';
import { IChatQuotaStatus } from './interfaces/chat-quota-status.interface';
import { ChatCacheService } from './chat-cache.service';
import { ChatToolActionService } from './chat-tool-action.service';
import { PendingChatToolActionDto } from './dto/chat-tool-action.dto';

export interface ChatStreamEvent {
  type: 'token' | 'done';
  data: string | Record<string, unknown>;
}

interface ChatTurnContext {
  session: ChatSessionDocument;
  sessionId: string;
  sanitizedMessage: string;
  guardrailFlags: string[];
  intent: EChatIntent;
  intentDetectionSource: ChatIntentDetectionSource;
  intentContext: IntentAwareChatContext;
  history: IAIChatMessage[];
  systemPrompt: string;
  promptEstimateSource: string;
  validJobIds: Set<string>;
  allContextJobs: Array<Record<string, any>>;
  contextCacheHit: boolean;
  contextCacheCategory?: string;
}

interface PrepareChatTurnOptions {
  sessionId?: string;
  jobId?: string;
  allowAiIntentClassifier: boolean;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  private readonly MAX_HISTORY_MESSAGES = 10;
  private readonly MAX_CONVERSATION_LENGTH = 100;
  private readonly CACHE_PREFIX_ACTIVE_SESSION = 'chat_session:';

  constructor(
    @InjectModel(ChatSession.name)
    private readonly chatSessionModel: Model<ChatSessionDocument>,
    @InjectModel(ChatMessage.name)
    private readonly chatMessageModel: Model<ChatMessageDocument>,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly aiService: AIService,
    private readonly chatIntentService: ChatIntentService,
    private readonly chatContextProviderRegistry: ChatContextProviderRegistry,
    private readonly chatPromptBuilder: ChatPromptBuilder,
    private readonly jobsService: JobsService,
    private readonly chatGuardrailService: ChatGuardrailService,
    private readonly aiUsageService: AiUsageService,
    private readonly chatQuotaService: ChatQuotaService,
    private readonly chatCacheService: ChatCacheService,
    private readonly chatToolActionService: ChatToolActionService,
  ) {}

  async createSession(user: IUser, dto: CreateChatSessionDto): Promise<ChatSessionDto> {
    this.validateUserId(user._id);

    const session = await this.chatSessionModel.create({
      userId: new Types.ObjectId(user._id),
      userRole: this.resolveUserRole(user),
      type: dto.type ?? EChatSessionType.GENERAL,
      title: dto.title?.trim() || undefined,
      isActive: true,
      lastMessageAt: new Date(),
    });

    await this.cacheManager.set(this.getActiveSessionCacheKey(user._id), session._id.toString(), 0);

    return this.serializeSession(session);
  }

  async listSessions(userId: string): Promise<ChatSessionListResponseDto> {
    this.validateUserId(userId);

    const sessions = await this.chatSessionModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .limit(50)
      .lean()
      .exec();

    return {
      sessions: sessions.map(session => this.serializeSession(session)),
    };
  }

  async sendMessage(
    user: IUser,
    message: string,
    sessionId?: string,
    jobId?: string,
  ): Promise<ChatResponseDto> {
    const startedAt = Date.now();
    let resolvedSessionId: string | undefined = sessionId;
    let guardrailFlags: string[] = [];
    let promptEstimateSource = message;
    let intent: EChatIntent | undefined;
    let intentDetectionSource: ChatIntentDetectionSource | undefined;

    try {
      const turn = await this.prepareChatTurn(user, message, {
        sessionId,
        jobId,
        allowAiIntentClassifier: true,
      });
      resolvedSessionId = turn.sessionId;
      guardrailFlags = turn.guardrailFlags;
      promptEstimateSource = turn.promptEstimateSource;
      intent = turn.intent;
      intentDetectionSource = turn.intentDetectionSource;

      const cachedFaqResponse = await this.getCachedFaqResponse(user, turn);
      if (cachedFaqResponse) {
        const usageMetadata = this.withEstimatedUsage(
          undefined,
          promptEstimateSource,
          Date.now() - startedAt,
        );
        const outputGuardrail = this.chatGuardrailService.sanitizeAssistantOutput(
          cachedFaqResponse.response,
        );
        guardrailFlags = [...new Set([...guardrailFlags, ...outputGuardrail.flags])];

        await this.persistMessageTurn({
          session: turn.session,
          userId: user._id,
          userMessage: turn.sanitizedMessage,
          assistantMessage: outputGuardrail.sanitizedOutput,
          relatedJobIds: cachedFaqResponse.recommendedJobIds ?? [],
          assistantMetadata: this.buildMessageMetadata(
            usageMetadata,
            false,
            guardrailFlags,
            undefined,
            turn.intent,
            turn.intentDetectionSource,
          ),
        });

        await this.recordUsage({
          userId: user._id,
          sessionId: turn.sessionId,
          operationType: 'chat_message',
          intent: turn.intent,
          intentDetectionSource: turn.intentDetectionSource,
          success: true,
          metadata: usageMetadata,
          guardrailFlags,
          cacheHit: true,
          cacheCategory: 'faq_response',
          requestStartedAt: new Date(startedAt),
          requestCompletedAt: new Date(),
        });

        const suggestedActions = this.extractSuggestedActions(
          outputGuardrail.sanitizedOutput,
          turn.intentContext.user,
        );

        return {
          sessionId: turn.sessionId,
          conversationId: turn.sessionId,
          response: outputGuardrail.sanitizedOutput,
          timestamp: new Date(),
          intent: turn.intent,
          suggestedActions: suggestedActions.length > 0 ? suggestedActions : undefined,
          recommendedJobIds: cachedFaqResponse.recommendedJobIds,
          cacheHit: true,
          cacheCategory: 'faq_response',
        };
      }

      const quotaStatus = await this.chatQuotaService.consume(user);
      const parsedResponse = await this.aiService.generateChat(
        turn.sanitizedMessage,
        turn.history,
        turn.systemPrompt,
      );
      const outputGuardrail = this.chatGuardrailService.sanitizeAssistantOutput(
        parsedResponse.text,
      );
      guardrailFlags = [...new Set([...guardrailFlags, ...outputGuardrail.flags])];

      const validatedJobIds = this.validateRecommendedJobIds(
        parsedResponse.recommendedJobIds ?? [],
        turn.validJobIds,
      );
      const recommendedJobs = this.buildRecommendedJobsFromIds(
        validatedJobIds,
        turn.allContextJobs,
      );
      const usageMetadata = this.withEstimatedUsage(
        parsedResponse.metadata,
        promptEstimateSource,
        Date.now() - startedAt,
      );
      const pendingToolActions = await this.createPendingToolActions({
        user,
        sessionId: turn.sessionId,
        responseText: outputGuardrail.sanitizedOutput,
        recommendedJobs,
      });

      await this.persistMessageTurn({
        session: turn.session,
        userId: user._id,
        userMessage: turn.sanitizedMessage,
        assistantMessage: outputGuardrail.sanitizedOutput,
        relatedJobIds: validatedJobIds,
        assistantMetadata: this.buildMessageMetadata(
          usageMetadata,
          parsedResponse.fallbackUsed,
          guardrailFlags,
          undefined,
          turn.intent,
          turn.intentDetectionSource,
        ),
      });

      const suggestedActions = this.extractSuggestedActions(
        outputGuardrail.sanitizedOutput,
        turn.intentContext.user,
      );

      await this.cacheFaqResponse(user, turn, outputGuardrail.sanitizedOutput, validatedJobIds);
      await this.recordUsage({
        userId: user._id,
        sessionId: turn.sessionId,
        operationType: 'chat_message',
        intent: turn.intent,
        intentDetectionSource: turn.intentDetectionSource,
        success: true,
        metadata: usageMetadata,
        fallbackUsed: parsedResponse.fallbackUsed,
        guardrailFlags,
        cacheHit: turn.contextCacheHit,
        cacheCategory: turn.contextCacheCategory,
        requestStartedAt: new Date(startedAt),
        requestCompletedAt: new Date(),
      });

      this.logger.log(`Successfully generated AI response for user ${user._id}`);

      return {
        sessionId: turn.sessionId,
        conversationId: turn.sessionId,
        response: outputGuardrail.sanitizedOutput,
        timestamp: new Date(),
        intent: turn.intent,
        suggestedActions: suggestedActions.length > 0 ? suggestedActions : undefined,
        recommendedJobIds: validatedJobIds.length > 0 ? validatedJobIds : undefined,
        recommendedJobs: recommendedJobs.length > 0 ? recommendedJobs : undefined,
        quota: quotaStatus,
        pendingToolActions: pendingToolActions.length > 0 ? pendingToolActions : undefined,
        cacheHit: turn.contextCacheHit || undefined,
        cacheCategory: turn.contextCacheCategory,
      };
    } catch (error) {
      guardrailFlags = this.resolveGuardrailFlags(error, guardrailFlags);
      await this.recordUsage({
        userId: user._id,
        sessionId: resolvedSessionId,
        operationType: 'chat_message',
        intent,
        intentDetectionSource,
        success: false,
        metadata: this.withEstimatedUsage(undefined, promptEstimateSource, Date.now() - startedAt),
        guardrailFlags,
        errorCategory: this.categorizeError(error),
        requestStartedAt: new Date(startedAt),
        requestCompletedAt: new Date(),
      });

      const errorDetails = error instanceof Error ? (error.stack ?? error.message) : error;
      this.logger.error(`Error sending message for user ${user._id}:`, errorDetails);
      throw this.mapChatError(error);
    }
  }

  async *streamMessage(
    user: IUser,
    message: string,
    sessionId?: string,
    jobId?: string,
  ): AsyncGenerator<ChatStreamEvent> {
    const startedAt = Date.now();
    let resolvedSessionId: string | undefined = sessionId;
    let guardrailFlags: string[] = [];
    let promptEstimateSource = message;
    let fullText = '';
    let intent: EChatIntent | undefined;
    let intentDetectionSource: ChatIntentDetectionSource | undefined;
    let quotaStatus: IChatQuotaStatus | undefined;

    try {
      const turn = await this.prepareChatTurn(user, message, {
        sessionId,
        jobId,
        allowAiIntentClassifier: false,
      });
      resolvedSessionId = turn.sessionId;
      guardrailFlags = turn.guardrailFlags;
      promptEstimateSource = turn.promptEstimateSource;
      intent = turn.intent;
      intentDetectionSource = turn.intentDetectionSource;

      const cachedFaqResponse = await this.getCachedFaqResponse(user, turn);
      if (cachedFaqResponse) {
        const outputGuardrail = this.chatGuardrailService.sanitizeAssistantOutput(
          cachedFaqResponse.response,
        );
        fullText = outputGuardrail.sanitizedOutput;
        guardrailFlags = [...new Set([...guardrailFlags, ...outputGuardrail.flags])];
        const usageMetadata = this.withEstimatedUsage(
          undefined,
          promptEstimateSource,
          Date.now() - startedAt,
        );

        yield { type: 'token', data: fullText };

        await this.persistMessageTurn({
          session: turn.session,
          userId: user._id,
          userMessage: turn.sanitizedMessage,
          assistantMessage: fullText,
          relatedJobIds: cachedFaqResponse.recommendedJobIds ?? [],
          assistantMetadata: this.buildMessageMetadata(
            usageMetadata,
            false,
            guardrailFlags,
            undefined,
            turn.intent,
            turn.intentDetectionSource,
          ),
        });

        await this.recordUsage({
          userId: user._id,
          sessionId: turn.sessionId,
          operationType: 'chat_stream',
          intent: turn.intent,
          intentDetectionSource: turn.intentDetectionSource,
          success: true,
          metadata: usageMetadata,
          guardrailFlags,
          cacheHit: true,
          cacheCategory: 'faq_response',
          requestStartedAt: new Date(startedAt),
          requestCompletedAt: new Date(),
        });

        const suggestedActions = this.extractSuggestedActions(fullText, turn.intentContext.user);

        yield {
          type: 'done',
          data: {
            sessionId: turn.sessionId,
            conversationId: turn.sessionId,
            intent: turn.intent,
            recommendedJobIds: cachedFaqResponse.recommendedJobIds,
            suggestedActions: suggestedActions.length > 0 ? suggestedActions : undefined,
            cacheHit: true,
            cacheCategory: 'faq_response',
          },
        };

        return;
      }

      quotaStatus = await this.chatQuotaService.consume(user);
      const gen = this.aiService.streamChat(turn.sanitizedMessage, turn.history, turn.systemPrompt);
      let iterResult = await gen.next();

      while (!iterResult.done) {
        const chunk = this.chatGuardrailService.sanitizeAssistantOutput(iterResult.value as string);
        fullText += chunk.sanitizedOutput;
        guardrailFlags = [...new Set([...guardrailFlags, ...chunk.flags])];
        yield { type: 'token', data: chunk.sanitizedOutput };
        iterResult = await gen.next();
      }

      const streamResult = iterResult.value;
      const outputGuardrail = this.chatGuardrailService.sanitizeAssistantOutput(fullText);
      fullText = outputGuardrail.sanitizedOutput;
      guardrailFlags = [...new Set([...guardrailFlags, ...outputGuardrail.flags])];
      const validatedJobIds = this.validateRecommendedJobIds(
        streamResult?.recommendedJobIds ?? [],
        turn.validJobIds,
      );
      const recommendedJobs = this.buildRecommendedJobsFromIds(
        validatedJobIds,
        turn.allContextJobs,
      );
      const usageMetadata = this.withEstimatedUsage(
        streamResult?.metadata,
        promptEstimateSource,
        Date.now() - startedAt,
      );
      const pendingToolActions = await this.createPendingToolActions({
        user,
        sessionId: turn.sessionId,
        responseText: fullText,
        recommendedJobs,
      });

      await this.persistMessageTurn({
        session: turn.session,
        userId: user._id,
        userMessage: turn.sanitizedMessage,
        assistantMessage: fullText,
        relatedJobIds: validatedJobIds,
        assistantMetadata: this.buildMessageMetadata(
          usageMetadata,
          streamResult?.fallbackUsed,
          guardrailFlags,
          undefined,
          turn.intent,
          turn.intentDetectionSource,
        ),
      });

      await this.recordUsage({
        userId: user._id,
        sessionId: turn.sessionId,
        operationType: 'chat_stream',
        intent: turn.intent,
        intentDetectionSource: turn.intentDetectionSource,
        success: true,
        metadata: usageMetadata,
        fallbackUsed: streamResult?.fallbackUsed,
        guardrailFlags,
        cacheHit: turn.contextCacheHit,
        cacheCategory: turn.contextCacheCategory,
        requestStartedAt: new Date(startedAt),
        requestCompletedAt: new Date(),
      });

      const suggestedActions = this.extractSuggestedActions(fullText, turn.intentContext.user);
      await this.cacheFaqResponse(user, turn, fullText, validatedJobIds);

      yield {
        type: 'done',
        data: {
          sessionId: turn.sessionId,
          conversationId: turn.sessionId,
          intent: turn.intent,
          recommendedJobIds: validatedJobIds.length > 0 ? validatedJobIds : undefined,
          recommendedJobs: recommendedJobs.length > 0 ? recommendedJobs : undefined,
          suggestedActions: suggestedActions.length > 0 ? suggestedActions : undefined,
          quota: quotaStatus,
          pendingToolActions: pendingToolActions.length > 0 ? pendingToolActions : undefined,
          cacheHit: turn.contextCacheHit || undefined,
          cacheCategory: turn.contextCacheCategory,
        },
      };

      this.logger.log(`Streaming message completed for user ${user._id}`);
    } catch (error) {
      guardrailFlags = this.resolveGuardrailFlags(error, guardrailFlags);
      await this.recordUsage({
        userId: user._id,
        sessionId: resolvedSessionId,
        operationType: 'chat_stream',
        intent,
        intentDetectionSource,
        success: false,
        metadata: this.withEstimatedUsage(undefined, promptEstimateSource, Date.now() - startedAt),
        guardrailFlags,
        errorCategory: this.categorizeError(error),
        requestStartedAt: new Date(startedAt),
        requestCompletedAt: new Date(),
      });

      const errorDetails = error instanceof Error ? (error.stack ?? error.message) : error;
      this.logger.error(`Error streaming message for user ${user._id}:`, errorDetails);
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

      const session = await this.findLatestActiveSession(userId);
      if (!session) {
        return {
          messages: [],
          total: 0,
          page,
          limit,
        };
      }

      return this.getSessionMessages(userId, session._id.toString(), page, limit);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(`Error fetching conversation history for user ${userId}:`, error);
      throw new BadRequestException('Failed to fetch conversation history');
    }
  }

  async getSessionMessages(
    userId: string,
    sessionId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<ConversationHistoryResponseDto> {
    try {
      this.validateUserId(userId);
      this.validateSessionId(sessionId);
      this.validatePagination(page, limit);

      const session = await this.getOwnedSession(userId, sessionId);
      const total = await this.chatMessageModel.countDocuments({
        sessionId: new Types.ObjectId(sessionId),
        userId: new Types.ObjectId(userId),
      });
      const endIndex = total - (page - 1) * limit;

      if (endIndex <= 0) {
        return {
          sessionId,
          conversationId: sessionId,
          messages: [],
          total,
          page,
          limit,
          title: session.title || undefined,
        };
      }

      const skip = Math.max(0, endIndex - limit);
      const pageLimit = endIndex - skip;

      const messages = await this.chatMessageModel
        .find({
          sessionId: new Types.ObjectId(sessionId),
          userId: new Types.ObjectId(userId),
        })
        .sort({ sequence: 1 })
        .skip(skip)
        .limit(pageLimit)
        .lean()
        .exec();

      const hydratedMessages = await this.hydrateRecommendedJobs(
        messages.map(message => this.serializeMessage(message)),
      );

      return {
        sessionId,
        conversationId: sessionId,
        messages: hydratedMessages,
        total,
        page,
        limit,
        title: session.title || undefined,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(`Error fetching session messages for user ${userId}:`, error);
      throw new BadRequestException('Failed to fetch conversation history');
    }
  }

  async clearConversation(userId: string): Promise<{ message: string }> {
    try {
      this.validateUserId(userId);

      const session = await this.findLatestActiveSession(userId);
      if (!session) {
        return { message: 'Conversation cleared successfully' };
      }

      await this.chatSessionModel.updateOne(
        {
          _id: session._id,
          userId: new Types.ObjectId(userId),
        },
        {
          $set: { isActive: false },
        },
      );

      await this.cacheManager.del(this.getActiveSessionCacheKey(userId));
      this.logger.log(`Conversation cleared for user ${userId}`);

      return { message: 'Conversation cleared successfully' };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(`Error clearing conversation for user ${userId}:`, error);
      throw new BadRequestException('Failed to clear conversation');
    }
  }

  async clearSession(userId: string, sessionId: string): Promise<{ message: string }> {
    try {
      this.validateUserId(userId);
      this.validateSessionId(sessionId);
      await this.getOwnedSession(userId, sessionId);

      await this.chatSessionModel.updateOne(
        {
          _id: new Types.ObjectId(sessionId),
          userId: new Types.ObjectId(userId),
        },
        {
          $set: { isActive: false },
        },
      );

      await this.cacheManager.del(this.getActiveSessionCacheKey(userId));
      return { message: 'Session cleared successfully' };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(`Error clearing chat session ${sessionId} for user ${userId}:`, error);
      throw new BadRequestException('Failed to clear chat session');
    }
  }

  private async prepareChatTurn(
    user: IUser,
    message: string,
    options: PrepareChatTurnOptions,
  ): Promise<ChatTurnContext> {
    this.validateUserId(user._id);

    const guardrail = this.chatGuardrailService.validateMessage(message);
    const sanitizedMessage = guardrail.sanitizedMessage;
    const session = options.sessionId
      ? await this.getOwnedSession(user._id, options.sessionId, true)
      : await this.getOrCreateActiveSession(user);

    const intentResult = await this.chatIntentService.detectIntent({
      user,
      message: sanitizedMessage,
      sessionType: session.type,
      jobId: options.jobId,
      allowAiFallback: options.allowAiIntentClassifier,
    });
    let contextCacheHit = false;
    let intentContext = await this.chatCacheService.getContext(
      user,
      intentResult.intent,
      sanitizedMessage,
      options.jobId,
    );

    if (intentContext) {
      contextCacheHit = true;
    } else {
      intentContext = await this.chatContextProviderRegistry.build(intentResult.intent, {
        user,
        message: sanitizedMessage,
        jobId: options.jobId,
      });
      await this.chatCacheService.setContext(
        user,
        intentResult.intent,
        sanitizedMessage,
        intentContext,
        options.jobId,
      );
    }

    const history = await this.getPromptHistory(session._id.toString());
    const systemPrompt = this.chatPromptBuilder.buildSystemPrompt(intentContext, session.summary);
    const promptEstimateSource = this.buildPromptEstimateSource(
      systemPrompt,
      history,
      sanitizedMessage,
    );

    return {
      session,
      sessionId: session._id.toString(),
      sanitizedMessage,
      guardrailFlags: guardrail.flags,
      intent: intentResult.intent,
      intentDetectionSource: intentResult.source,
      intentContext,
      history,
      systemPrompt,
      promptEstimateSource,
      validJobIds: new Set(intentContext.validJobIds),
      allContextJobs: intentContext.contextJobs,
      contextCacheHit,
      contextCacheCategory: contextCacheHit ? 'retrieval_context' : undefined,
    };
  }

  private async getOrCreateActiveSession(user: IUser): Promise<ChatSessionDocument> {
    const cacheKey = this.getActiveSessionCacheKey(user._id);
    const cachedId = await this.cacheManager.get<string>(cacheKey);

    if (cachedId && Types.ObjectId.isValid(cachedId)) {
      const session = await this.chatSessionModel
        .findOne({
          _id: new Types.ObjectId(cachedId),
          userId: new Types.ObjectId(user._id),
          isActive: true,
        })
        .exec();

      if (session) {
        return session;
      }

      await this.cacheManager.del(cacheKey);
    }

    let session = await this.findLatestActiveSession(user._id);

    if (!session) {
      session = await this.chatSessionModel.create({
        userId: new Types.ObjectId(user._id),
        userRole: this.resolveUserRole(user),
        type: EChatSessionType.GENERAL,
        isActive: true,
        lastMessageAt: new Date(),
      });
      this.logger.log(`Created new chat session for user ${user._id}`);
    }

    await this.cacheManager.set(cacheKey, session._id.toString(), 0);
    return session;
  }

  private async findLatestActiveSession(userId: string): Promise<ChatSessionDocument | null> {
    return this.chatSessionModel
      .findOne({
        userId: new Types.ObjectId(userId),
        isActive: true,
      })
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .exec();
  }

  private async getOwnedSession(
    userId: string,
    sessionId: string,
    requireActive = false,
  ): Promise<ChatSessionDocument> {
    this.validateSessionId(sessionId);

    const filter: Record<string, any> = {
      _id: new Types.ObjectId(sessionId),
      userId: new Types.ObjectId(userId),
    };

    if (requireActive) {
      filter.isActive = true;
    }

    const session = await this.chatSessionModel.findOne(filter).exec();
    if (!session) {
      throw new NotFoundException('Chat session not found');
    }

    return session;
  }

  private async getPromptHistory(sessionId: string): Promise<IAIChatMessage[]> {
    const messages = await this.chatMessageModel
      .find({
        sessionId: new Types.ObjectId(sessionId),
        role: { $in: [EChatMessageRole.USER, EChatMessageRole.ASSISTANT] },
      })
      .sort({ sequence: -1 })
      .limit(this.MAX_HISTORY_MESSAGES)
      .lean()
      .exec();

    return messages.reverse().map(message => ({
      role: message.role,
      content: message.content,
    }));
  }

  private async persistMessageTurn(input: {
    session: ChatSessionDocument;
    userId: string;
    userMessage: string;
    assistantMessage: string;
    relatedJobIds: string[];
    assistantMetadata: IChatMessageMetadata;
  }): Promise<void> {
    const sessionId = input.session._id.toString();
    const messageCount = await this.chatMessageModel.countDocuments({
      sessionId: new Types.ObjectId(sessionId),
    });
    const now = new Date();

    await this.chatMessageModel.insertMany([
      {
        sessionId: new Types.ObjectId(sessionId),
        userId: new Types.ObjectId(input.userId),
        role: EChatMessageRole.USER,
        content: input.userMessage,
        sequence: messageCount + 1,
        metadata: {
          guardrailFlags: input.assistantMetadata.guardrailFlags ?? [],
        },
        createdAt: now,
        updatedAt: now,
      },
      {
        sessionId: new Types.ObjectId(sessionId),
        userId: new Types.ObjectId(input.userId),
        role: EChatMessageRole.ASSISTANT,
        content: input.assistantMessage,
        sequence: messageCount + 2,
        relatedJobIds: input.relatedJobIds.length > 0 ? input.relatedJobIds : undefined,
        metadata: input.assistantMetadata,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const updatePayload: Record<string, any> = {
      lastMessageAt: now,
    };

    if (!input.session.title) {
      updatePayload.title = input.userMessage.slice(0, 80);
    }

    await this.chatSessionModel.updateOne({ _id: input.session._id }, { $set: updatePayload });

    if (messageCount + 2 > this.MAX_CONVERSATION_LENGTH) {
      await this.archiveLongSession(input.session);
    }
  }

  private async archiveLongSession(session: ChatSessionDocument): Promise<void> {
    try {
      const sessionId = session._id.toString();
      const allMessages = await this.chatMessageModel
        .find({ sessionId: new Types.ObjectId(sessionId) })
        .sort({ sequence: 1 })
        .select('role content')
        .lean()
        .exec();

      const summary = await this.aiService
        .summarizeConversation(
          allMessages.map(message => ({
            role: message.role,
            content: message.content,
          })),
        )
        .catch(() => 'Previous conversation context');

      await this.chatSessionModel.updateOne(
        { _id: session._id },
        {
          $set: {
            isActive: false,
            summary,
          },
        },
      );

      const carryOverMessages = await this.chatMessageModel
        .find({ sessionId: new Types.ObjectId(sessionId) })
        .sort({ sequence: -1 })
        .limit(5)
        .lean()
        .exec();

      const newSession = await this.chatSessionModel.create({
        userId: session.userId,
        userRole: session.userRole,
        type: session.type,
        title: session.title,
        summary,
        isActive: true,
        lastMessageAt: new Date(),
      });

      const orderedCarryOver = carryOverMessages.reverse();
      if (orderedCarryOver.length > 0) {
        await this.chatMessageModel.insertMany(
          orderedCarryOver.map((message, index) => ({
            sessionId: newSession._id,
            userId: message.userId,
            role: message.role,
            content: message.content,
            sequence: index + 1,
            relatedJobIds: message.relatedJobIds,
            metadata: message.metadata,
            createdAt: message.createdAt,
            updatedAt: message.updatedAt,
          })),
        );
      }

      await this.cacheManager.set(
        this.getActiveSessionCacheKey(session.userId.toString()),
        newSession._id.toString(),
        0,
      );

      this.logger.log(`Archived chat session ${session._id}, created ${newSession._id}`);
    } catch (error) {
      this.logger.error('Error archiving chat session:', error);
    }
  }

  private async getCachedFaqResponse(
    user: IUser,
    turn: ChatTurnContext,
  ): Promise<{ response: string; recommendedJobIds?: string[] } | undefined> {
    if (turn.intent !== EChatIntent.FAQ) {
      return undefined;
    }

    return this.chatCacheService.getFaqResponse(
      user,
      turn.sanitizedMessage,
      turn.intentContext.faq?.topic,
    );
  }

  private async cacheFaqResponse(
    user: IUser,
    turn: ChatTurnContext,
    response: string,
    recommendedJobIds: string[],
  ): Promise<void> {
    if (turn.intent !== EChatIntent.FAQ) {
      return;
    }

    await this.chatCacheService.setFaqResponse(
      user,
      turn.sanitizedMessage,
      {
        response,
        recommendedJobIds: recommendedJobIds.length > 0 ? recommendedJobIds : undefined,
      },
      turn.intentContext.faq?.topic,
    );
  }

  private async createPendingToolActions(input: {
    user: IUser;
    sessionId: string;
    responseText: string;
    recommendedJobs: ChatRecommendedJobDto[];
  }): Promise<PendingChatToolActionDto[]> {
    if (
      input.recommendedJobs.length === 0 ||
      !this.shouldProposeSaveJobActions(input.responseText)
    ) {
      return [];
    }

    return this.chatToolActionService.createSaveJobActions({
      user: input.user,
      sessionId: input.sessionId,
      jobs: input.recommendedJobs,
    });
  }

  private shouldProposeSaveJobActions(responseText: string): boolean {
    const normalizedResponse = responseText.toLowerCase();
    return (
      normalizedResponse.includes('save') ||
      normalizedResponse.includes('bookmark') ||
      normalizedResponse.includes('lưu') ||
      normalizedResponse.includes('luu')
    );
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

  private validateSessionId(sessionId: string): void {
    if (!Types.ObjectId.isValid(sessionId)) {
      throw new BadRequestException('Invalid chat session ID format');
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

  private async hydrateRecommendedJobs(messages: MessageDto[]): Promise<MessageDto[]> {
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

  private serializeMessage(message: Record<string, any>): MessageDto {
    return {
      role: message.role,
      content: message.content,
      timestamp: message.createdAt ?? message.updatedAt ?? new Date(),
      recommendedJobIds: message.relatedJobIds,
    };
  }

  private serializeSession(session: Record<string, any>): ChatSessionDto {
    const sessionId = session._id?.toString?.() ?? String(session._id);

    return {
      sessionId,
      conversationId: sessionId,
      type: session.type ?? EChatSessionType.GENERAL,
      title: session.title,
      isActive: session.isActive,
      lastMessageAt: session.lastMessageAt,
      createdAt: session.createdAt,
    };
  }

  private validateRecommendedJobIds(
    recommendedJobIds: string[],
    validJobIds: Set<string>,
  ): string[] {
    return [...new Set(recommendedJobIds.filter(id => validJobIds.has(id)))];
  }

  private buildPromptEstimateSource(
    systemPrompt: string,
    history: IAIChatMessage[],
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

  private buildMessageMetadata(
    metadata: IAIChatUsageMetadata | undefined,
    fallbackUsed?: boolean,
    guardrailFlags?: string[],
    errorCategory?: string,
    intent?: EChatIntent,
    intentDetectionSource?: ChatIntentDetectionSource,
  ): IChatMessageMetadata {
    return {
      provider: metadata?.provider,
      model: metadata?.model,
      intent,
      intentDetectionSource,
      latencyMs: metadata?.latencyMs,
      promptTokens: metadata?.promptTokens,
      completionTokens: metadata?.completionTokens,
      totalTokens: metadata?.totalTokens,
      estimatedPromptTokens: metadata?.estimatedPromptTokens,
      fallbackUsed: fallbackUsed ?? false,
      guardrailFlags: guardrailFlags ?? [],
      errorCategory,
    };
  }

  private async recordUsage(input: {
    userId: string;
    sessionId?: string;
    conversationId?: string;
    operationType: string;
    intent?: EChatIntent;
    intentDetectionSource?: ChatIntentDetectionSource;
    success: boolean;
    metadata?: IAIChatUsageMetadata;
    fallbackUsed?: boolean;
    guardrailFlags?: string[];
    errorCategory?: string;
    cacheHit?: boolean;
    cacheCategory?: string;
    requestStartedAt?: Date;
    requestCompletedAt?: Date;
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

    if (error instanceof ChatQuotaExceededException) {
      return 'QUOTA_EXCEEDED';
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

    if (error instanceof NotFoundException) {
      return 'NOT_FOUND';
    }

    return 'UNKNOWN';
  }

  private mapChatError(error: unknown): Error {
    if (error instanceof HttpException) {
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

  private resolveUserRole(user: IUser): string {
    return user.role?.name || 'UNKNOWN';
  }

  private getActiveSessionCacheKey(userId: string): string {
    return `${this.CACHE_PREFIX_ACTIVE_SESSION}${userId}`;
  }
}
