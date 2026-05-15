import { MatchResultDto } from 'src/matching/dto/match-result.dto';
import { EChatIntent } from '../enums/chat-intent.enum';

export interface PlatformContext {
  activeJobCount: number;
  hiringCompaniesCount: number;
  topSkills: Array<{ name: string; count: number }>;
  topCompanies: Array<{ _id: string; name: string; jobCount: number }>;
  jobsByLevel: Array<{ level: string; count: number }>;
}

export interface UserContext {
  user: { name: string; email: string } | null;
  profile: {
    skills: string[];
    experience: any[];
    education: any[];
    summary?: string;
    yearsOfExperience?: number;
  } | null;
  matchingJobs: any[];
  appliedJobsCount: number;
}

export interface QueryAwareContext {
  detectedJobs: any[];
  detectedCompanies: Array<{
    _id: string;
    name: string;
    address: string;
    description: string;
    jobCount: number;
  }>;
  includeStats: boolean;
}

export interface FullChatContext {
  platform: PlatformContext;
  user: UserContext;
  queryAware: QueryAwareContext;
}

export interface ChatFaqContext {
  topic: string;
  answer: string;
}

export interface ChatCvReviewContext {
  hasProfile: boolean;
  missingFields: string[];
  recommendations: string[];
}

export interface ChatJobMatchingContext {
  selectedJob: any | null;
  matchResult?: MatchResultDto;
  missingReason?: string;
}

export interface IntentAwareChatContext {
  intent: EChatIntent;
  platform?: PlatformContext;
  user: UserContext;
  queryAware: QueryAwareContext;
  faq?: ChatFaqContext;
  cvReview?: ChatCvReviewContext;
  jobMatching?: ChatJobMatchingContext;
  contextJobs: any[];
  validJobIds: string[];
}
