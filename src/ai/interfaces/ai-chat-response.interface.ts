import { AIProvider } from '../ai.constants';
import { IAIChatUsageMetadata } from './ai-chat-usage-metadata.interface';

export interface IAIChatResponse {
  text: string;
  recommendedJobIds: string[];
  provider: AIProvider;
  fallbackUsed?: boolean;
  metadata?: IAIChatUsageMetadata;
  cacheHit?: boolean;
  cacheCategory?: string;
}
