import { EChatIntent } from '../enums/chat-intent.enum';

export type ChatIntentDetectionSource = 'deterministic' | 'session_type' | 'ai' | 'fallback';

export interface IChatIntentResult {
  intent: EChatIntent;
  confidence: number;
  source: ChatIntentDetectionSource;
}
