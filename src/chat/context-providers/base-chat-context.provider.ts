import { QueryAwareContext, UserContext } from '../interfaces/chat-context.interface';

export const EMPTY_QUERY_AWARE_CONTEXT: QueryAwareContext = {
  detectedJobs: [],
  detectedCompanies: [],
  includeStats: false,
};

export const EMPTY_USER_CONTEXT: UserContext = {
  user: null,
  profile: null,
  matchingJobs: [],
  appliedJobsCount: 0,
};

export function uniqueJobs(jobs: any[]): any[] {
  const seenIds = new Set<string>();

  return jobs.filter(job => {
    const id = job?._id?.toString?.() ?? String(job?._id ?? '');
    if (!id || seenIds.has(id)) {
      return false;
    }

    seenIds.add(id);
    return true;
  });
}

export function jobIds(jobs: any[]): string[] {
  return uniqueJobs(jobs).map(job => job._id?.toString?.() ?? String(job._id));
}
