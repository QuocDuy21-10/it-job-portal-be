import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IAIChatUsageMetadata } from 'src/ai/interfaces/ai-chat-usage-metadata.interface';
import { AiUsageLog, AiUsageLogDocument } from './schemas/ai-usage-log.schema';
import { EChatIntent } from './enums/chat-intent.enum';
import { ChatIntentDetectionSource } from './interfaces/chat-intent-result.interface';
import {
  AiUsageQueryDto,
  AiUsageTimeseriesQueryDto,
  AiUsageTopUsersQueryDto,
} from './dto/ai-usage-query.dto';
import {
  AiUsageSummaryDto,
  AiUsageTimeseriesDto,
  AiUsageTopUsersDto,
} from './dto/ai-usage-stats.dto';

export interface CreateAiUsageLogInput {
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
  latencyMs?: number;
  cacheHit?: boolean;
  cacheCategory?: string;
  requestStartedAt?: Date;
  requestCompletedAt?: Date;
}

@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);

  constructor(
    @InjectModel(AiUsageLog.name)
    private readonly aiUsageLogModel: Model<AiUsageLogDocument>,
    private readonly configService: ConfigService,
  ) {}

  async record(input: CreateAiUsageLogInput): Promise<void> {
    try {
      const cost = this.calculateEstimatedCost(input.metadata);

      await this.aiUsageLogModel.create({
        userId: new Types.ObjectId(input.userId),
        sessionId: input.sessionId ? new Types.ObjectId(input.sessionId) : undefined,
        conversationId: input.conversationId ? new Types.ObjectId(input.conversationId) : undefined,
        operationType: input.operationType,
        intent: input.intent,
        intentDetectionSource: input.intentDetectionSource,
        provider: input.metadata?.provider,
        model: input.metadata?.model,
        promptTokens: input.metadata?.promptTokens,
        completionTokens: input.metadata?.completionTokens,
        totalTokens: input.metadata?.totalTokens,
        estimatedPromptTokens: input.metadata?.estimatedPromptTokens,
        latencyMs: input.metadata?.latencyMs ?? input.latencyMs,
        estimatedCostUsd: cost.estimatedCostUsd,
        costEstimated: cost.costEstimated,
        cacheHit: input.cacheHit ?? false,
        cacheCategory: input.cacheCategory,
        requestStartedAt: input.requestStartedAt,
        requestCompletedAt: input.requestCompletedAt,
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

  async getUsageSummary(query: AiUsageQueryDto): Promise<AiUsageSummaryDto> {
    const match = this.buildMatchStage(query);
    const [summary] = await this.aiUsageLogModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalRequests: { $sum: 1 },
          successfulRequests: { $sum: { $cond: ['$success', 1, 0] } },
          failedRequests: { $sum: { $cond: ['$success', 0, 1] } },
          fallbackRequests: { $sum: { $cond: ['$fallbackUsed', 1, 0] } },
          cacheHits: { $sum: { $cond: ['$cacheHit', 1, 0] } },
          totalTokens: { $sum: { $ifNull: ['$totalTokens', 0] } },
          estimatedCostUsd: { $sum: { $ifNull: ['$estimatedCostUsd', 0] } },
          averageLatencyMs: { $avg: '$latencyMs' },
          latencies: { $push: '$latencyMs' },
          quotaDenials: {
            $sum: { $cond: [{ $eq: ['$errorCategory', 'QUOTA_EXCEEDED'] }, 1, 0] },
          },
          guardrailBlocks: {
            $sum: { $cond: [{ $eq: ['$errorCategory', 'GUARDRAIL_BLOCKED'] }, 1, 0] },
          },
        },
      },
    ]);

    const errorsByCategory = await this.getErrorsByCategory(match);
    const totalRequests = summary?.totalRequests ?? 0;

    return {
      totalRequests,
      successfulRequests: summary?.successfulRequests ?? 0,
      failedRequests: summary?.failedRequests ?? 0,
      successRate: this.percent(summary?.successfulRequests ?? 0, totalRequests),
      fallbackRequests: summary?.fallbackRequests ?? 0,
      fallbackRate: this.percent(summary?.fallbackRequests ?? 0, totalRequests),
      cacheHits: summary?.cacheHits ?? 0,
      cacheHitRate: this.percent(summary?.cacheHits ?? 0, totalRequests),
      averageLatencyMs: this.round(summary?.averageLatencyMs ?? 0),
      p95LatencyMs: this.calculateP95(summary?.latencies ?? []),
      totalTokens: summary?.totalTokens ?? 0,
      estimatedCostUsd: this.roundCost(summary?.estimatedCostUsd ?? 0),
      quotaDenials: summary?.quotaDenials ?? 0,
      guardrailBlocks: summary?.guardrailBlocks ?? 0,
      errorsByCategory,
      generatedAt: new Date(),
    };
  }

  async getUsageTimeseries(query: AiUsageTimeseriesQueryDto): Promise<AiUsageTimeseriesDto> {
    const match = this.buildMatchStage({
      ...query,
      startDate:
        query.startDate ??
        new Date(Date.now() - (query.days ?? 30) * 24 * 60 * 60 * 1000).toISOString(),
    });

    const points = await this.aiUsageLogModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: { $ifNull: ['$requestStartedAt', '$createdAt'] },
            },
          },
          requests: { $sum: 1 },
          successfulRequests: { $sum: { $cond: ['$success', 1, 0] } },
          failedRequests: { $sum: { $cond: ['$success', 0, 1] } },
          totalTokens: { $sum: { $ifNull: ['$totalTokens', 0] } },
          estimatedCostUsd: { $sum: { $ifNull: ['$estimatedCostUsd', 0] } },
          averageLatencyMs: { $avg: '$latencyMs' },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          date: '$_id',
          requests: 1,
          successfulRequests: 1,
          failedRequests: 1,
          totalTokens: 1,
          estimatedCostUsd: { $round: ['$estimatedCostUsd', 6] },
          averageLatencyMs: { $round: [{ $ifNull: ['$averageLatencyMs', 0] }, 0] },
        },
      },
    ]);

    return {
      points,
      generatedAt: new Date(),
    };
  }

  async getTopUsers(query: AiUsageTopUsersQueryDto): Promise<AiUsageTopUsersDto> {
    const match = this.buildMatchStage(query);
    const users = await this.aiUsageLogModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$userId',
          requests: { $sum: 1 },
          totalTokens: { $sum: { $ifNull: ['$totalTokens', 0] } },
          estimatedCostUsd: { $sum: { $ifNull: ['$estimatedCostUsd', 0] } },
          averageLatencyMs: { $avg: '$latencyMs' },
        },
      },
      { $sort: { requests: -1 } },
      { $limit: query.limit ?? 10 },
      {
        $project: {
          _id: 0,
          userId: { $toString: '$_id' },
          requests: 1,
          totalTokens: 1,
          estimatedCostUsd: { $round: ['$estimatedCostUsd', 6] },
          averageLatencyMs: { $round: [{ $ifNull: ['$averageLatencyMs', 0] }, 0] },
        },
      },
    ]);

    return {
      users,
      generatedAt: new Date(),
    };
  }

  private calculateEstimatedCost(metadata?: IAIChatUsageMetadata): {
    estimatedCostUsd?: number;
    costEstimated: boolean;
  } {
    if (!metadata?.provider) {
      return { costEstimated: false };
    }

    const promptTokens = metadata.promptTokens ?? metadata.estimatedPromptTokens ?? 0;
    const completionTokens = metadata.completionTokens ?? 0;
    const promptRate = this.readCostRate(metadata.provider, metadata.model, 'PROMPT');
    const completionRate = this.readCostRate(metadata.provider, metadata.model, 'COMPLETION');
    const estimatedCostUsd =
      (promptTokens / 1000) * promptRate + (completionTokens / 1000) * completionRate;

    return {
      estimatedCostUsd: this.roundCost(estimatedCostUsd),
      costEstimated: Boolean(metadata.estimatedPromptTokens && !metadata.promptTokens),
    };
  }

  private readCostRate(provider: string, model: string | undefined, tokenType: string): number {
    const modelKey = model ? this.toConfigKey(model) : 'DEFAULT';
    const providerKey = this.toConfigKey(provider);
    const configKeys = [
      `AI_COST_${providerKey}_${modelKey}_${tokenType}_USD_PER_1K`,
      `AI_COST_${providerKey}_${tokenType}_USD_PER_1K`,
      `AI_COST_${tokenType}_USD_PER_1K`,
    ];

    for (const key of configKeys) {
      const rawValue = this.configService.get<string>(key);
      const parsedValue = rawValue ? Number.parseFloat(rawValue) : Number.NaN;
      if (Number.isFinite(parsedValue) && parsedValue >= 0) {
        return parsedValue;
      }
    }

    return 0;
  }

  private buildMatchStage(query: AiUsageQueryDto): Record<string, any> {
    const match: Record<string, any> = {};

    if (query.startDate || query.endDate) {
      match.createdAt = {};
      if (query.startDate) {
        match.createdAt.$gte = new Date(query.startDate);
      }
      if (query.endDate) {
        match.createdAt.$lte = new Date(query.endDate);
      }
    }

    if (query.provider) {
      match.provider = query.provider;
    }
    if (query.model) {
      match.model = query.model;
    }
    if (query.intent) {
      match.intent = query.intent;
    }

    return match;
  }

  private async getErrorsByCategory(match: Record<string, any>): Promise<Record<string, number>> {
    const rows = await this.aiUsageLogModel.aggregate([
      {
        $match: {
          ...match,
          success: false,
          errorCategory: { $exists: true, $ne: null },
        },
      },
      { $group: { _id: '$errorCategory', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    return rows.reduce<Record<string, number>>((result, row) => {
      result[row._id] = row.count;
      return result;
    }, {});
  }

  private calculateP95(latencies: Array<number | null | undefined>): number {
    const values = latencies
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      .sort((a, b) => a - b);

    if (values.length === 0) {
      return 0;
    }

    const index = Math.ceil(values.length * 0.95) - 1;
    return Math.round(values[Math.max(0, index)]);
  }

  private percent(value: number, total: number): number {
    if (total <= 0) {
      return 0;
    }

    return this.round((value / total) * 100, 2);
  }

  private round(value: number, digits = 0): number {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  private roundCost(value: number): number {
    return this.round(value, 6);
  }

  private toConfigKey(value: string): string {
    return value
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }
}
