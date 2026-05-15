import { JobsService } from 'src/jobs/jobs.service';
import { MatchingService } from 'src/matching/matching.service';
import { ChatContextService } from './chat-context.service';
import { CompanyContextProvider } from './context-providers/company-context.provider';
import { CvReviewContextProvider } from './context-providers/cv-review-context.provider';
import { FaqContextProvider } from './context-providers/faq-context.provider';
import { JobMatchingContextProvider } from './context-providers/job-matching-context.provider';
import { JobSearchContextProvider } from './context-providers/job-search-context.provider';
import { EChatIntent } from './enums/chat-intent.enum';

const user = { _id: '507f1f77bcf86cd799439011' };

describe('Chat context providers', () => {
  const platform = {
    activeJobCount: 2,
    hiringCompaniesCount: 1,
    topSkills: [{ name: 'NodeJS', count: 2 }],
    topCompanies: [{ _id: 'company-1', name: 'Acme', jobCount: 1 }],
    jobsByLevel: [{ level: 'MID', count: 1 }],
  };
  const job = {
    _id: { toString: () => '507f1f77bcf86cd799439012' },
    name: 'Backend Developer',
    company: { name: 'Acme' },
    location: 'Ho Chi Minh City',
    skills: ['NodeJS'],
    level: 'MID',
  };
  const userContext = {
    user: { name: 'Duy', email: 'duy@example.com' },
    profile: {
      skills: ['NodeJS'],
      experience: [{ company: 'A', position: 'Developer', startDate: '2022', endDate: '2024' }],
      education: [{ school: 'HCMUT', degree: 'BS', field: 'CS' }],
      summary: 'Backend developer',
      yearsOfExperience: 2,
    },
    matchingJobs: [job],
    appliedJobsCount: 0,
  };
  let chatContextService: {
    buildPlatformContext: jest.Mock;
    buildUserContext: jest.Mock;
    buildQueryAwareContext: jest.Mock;
  };

  beforeEach(() => {
    chatContextService = {
      buildPlatformContext: jest.fn().mockResolvedValue(platform),
      buildUserContext: jest.fn().mockResolvedValue(userContext),
      buildQueryAwareContext: jest.fn().mockResolvedValue({
        detectedJobs: [job],
        detectedCompanies: [
          {
            _id: 'company-1',
            name: 'Acme',
            address: 'HCMC',
            description: 'Software company',
            jobCount: 1,
          },
        ],
        includeStats: false,
      }),
    };
  });

  it('job search provider returns only job search context and stable job IDs', async () => {
    const provider = new JobSearchContextProvider(
      chatContextService as unknown as ChatContextService,
    );

    await expect(provider.build({ user: user as any, message: 'NodeJS jobs' })).resolves.toEqual(
      expect.objectContaining({
        intent: EChatIntent.JOB_ADVISOR,
        platform,
        validJobIds: ['507f1f77bcf86cd799439012'],
      }),
    );
  });

  it('company provider includes company context without user matching jobs', async () => {
    const provider = new CompanyContextProvider(
      chatContextService as unknown as ChatContextService,
    );
    const result = await provider.build({ user: user as any, message: 'Acme company' });

    expect(result.intent).toBe(EChatIntent.COMPANY_INFO);
    expect(result.queryAware.detectedCompanies).toHaveLength(1);
    expect(result.contextJobs).toHaveLength(1);
  });

  it('CV review provider reports profile completeness signals', async () => {
    const provider = new CvReviewContextProvider(
      chatContextService as unknown as ChatContextService,
    );

    await expect(provider.build({ user: user as any, message: 'review cv' })).resolves.toEqual(
      expect.objectContaining({
        intent: EChatIntent.CV_REVIEW,
        cvReview: expect.objectContaining({
          hasProfile: true,
          missingFields: [],
        }),
        validJobIds: [],
      }),
    );
  });

  it('job matching provider calculates deterministic match when jobId is available', async () => {
    const jobsService = {
      findPublicChatCardJobsByIds: jest.fn().mockResolvedValue([job]),
    };
    const matchingService = {
      calculateMatch: jest.fn().mockResolvedValue({ matchingScore: 80 }),
    };
    const provider = new JobMatchingContextProvider(
      chatContextService as unknown as ChatContextService,
      jobsService as unknown as JobsService,
      matchingService as unknown as MatchingService,
    );

    const result = await provider.build({
      user: user as any,
      message: 'match this job',
      jobId: '507f1f77bcf86cd799439012',
    });

    expect(result.intent).toBe(EChatIntent.JOB_MATCHING);
    expect(result.jobMatching?.matchResult).toEqual({ matchingScore: 80 });
    expect(matchingService.calculateMatch).toHaveBeenCalledWith(
      expect.objectContaining({ skills: ['NodeJS'], yearsOfExperience: 2 }),
      job,
    );
  });

  it('FAQ provider resolves static FAQ context without job IDs', async () => {
    const provider = new FaqContextProvider(chatContextService as unknown as ChatContextService);

    await expect(provider.build({ user: user as any, message: 'How to apply?' })).resolves.toEqual(
      expect.objectContaining({
        intent: EChatIntent.FAQ,
        faq: expect.objectContaining({ topic: 'apply' }),
        validJobIds: [],
      }),
    );
  });
});
