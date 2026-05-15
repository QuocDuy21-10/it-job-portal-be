import { AIProvider } from '../ai.constants';
import { IAIChatUsageMetadata } from './ai-chat-usage-metadata.interface';

export interface IAIChatStreamResult {
  recommendedJobIds: string[];
  provider: AIProvider;
  model?: string;
  fallbackUsed?: boolean;
  metadata?: IAIChatUsageMetadata;
  cacheHit?: boolean;
  cacheCategory?: string;
}
