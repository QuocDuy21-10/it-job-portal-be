import { IUser } from 'src/users/user.interface';
import { IntentAwareChatContext } from '../interfaces/chat-context.interface';

export interface ChatContextProviderInput {
  user: IUser;
  message: string;
  jobId?: string;
}

export type ChatContextProviderResult = IntentAwareChatContext;
