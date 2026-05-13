import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IAIChatUsageMetadata } from 'src/ai/interfaces/ai-chat-usage-metadata.interface';
import { AiUsageLog, AiUsageLogDocument } from './schemas/ai-usage-log.schema';

export interface CreateAiUsageLogInput {
  userId: string;
  conversationId?: string;
  operationType: string;
  success: boolean;
  metadata?: IAIChatUsageMetadata;
  fallbackUsed?: boolean;
  guardrailFlags?: string[];
  errorCategory?: string;
  latencyMs?: number;
}

@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);

  constructor(
    @InjectModel(AiUsageLog.name)
    private readonly aiUsageLogModel: Model<AiUsageLogDocument>,
  ) {}

  async record(input: CreateAiUsageLogInput): Promise<void> {
    try {
      await this.aiUsageLogModel.create({
        userId: new Types.ObjectId(input.userId),
        conversationId: input.conversationId
          ? new Types.ObjectId(input.conversationId)
          : undefined,
        operationType: input.operationType,
        provider: input.metadata?.provider,
        model: input.metadata?.model,
        promptTokens: input.metadata?.promptTokens,
        completionTokens: input.metadata?.completionTokens,
        totalTokens: input.metadata?.totalTokens,
        estimatedPromptTokens: input.metadata?.estimatedPromptTokens,
        latencyMs: input.metadata?.latencyMs ?? input.latencyMs,
        success: input.success,
        fallbackUsed: input.fallbackUsed ?? false,
        guardrailFlags: input.guardrailFlags ?? [],
        errorCategory: input.errorCategory,
      });
    } catch (error) {
      this.logger.warn(
        'Failed to persist AI usage log',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

