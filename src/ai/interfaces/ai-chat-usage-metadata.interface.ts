import { AIProvider } from '../ai.constants';

export interface IAIChatUsageMetadata {
  provider: AIProvider;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedPromptTokens?: number;
  latencyMs?: number;
}
