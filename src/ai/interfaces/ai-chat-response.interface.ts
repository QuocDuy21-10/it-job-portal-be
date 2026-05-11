import { AIProvider } from '../ai.constants';

export interface IAIChatResponse {
  text: string;
  recommendedJobIds: string[];
  provider: AIProvider;
  fallbackUsed?: boolean;
}
