import { AIProvider } from 'src/ai/ai.constants';
import { EChatIntent } from '../enums/chat-intent.enum';
import { ChatIntentDetectionSource } from './chat-intent-result.interface';

export interface IChatMessageMetadata {
  provider?: AIProvider;
  model?: string;
  intent?: EChatIntent;
  intentDetectionSource?: ChatIntentDetectionSource;
  latencyMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedPromptTokens?: number;
  fallbackUsed?: boolean;
  guardrailFlags?: string[];
  errorCategory?: string;
}
