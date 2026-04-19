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
