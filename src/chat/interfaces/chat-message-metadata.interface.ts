import { AIProvider } from 'src/ai/ai.constants';

export interface IChatMessageMetadata {
  provider?: AIProvider;
  model?: string;
  intent?: string;
  latencyMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedPromptTokens?: number;
  fallbackUsed?: boolean;
  guardrailFlags?: string[];
  errorCategory?: string;
}
