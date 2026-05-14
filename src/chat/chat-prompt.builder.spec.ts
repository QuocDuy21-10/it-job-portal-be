import { ChatPromptBuilder } from './chat-prompt.builder';
import { EChatIntent } from './enums/chat-intent.enum';
import { IntentAwareChatContext } from './interfaces/chat-context.interface';

describe('ChatPromptBuilder', () => {
  const builder = new ChatPromptBuilder();
  const baseContext: IntentAwareChatContext = {
    intent: EChatIntent.CV_REVIEW,
    user: {
      user: { name: 'Duy', email: 'duy@example.com' },
      profile: {
        skills: ['NodeJS'],
        experience: [],
        education: [],
        summary: 'Backend developer',
      },
      matchingJobs: [
        {
          _id: 'job-1',
          name: 'Backend Developer',
          company: { name: 'Acme' },
          skills: ['NodeJS'],
        },
      ],
      appliedJobsCount: 0,
    },
    queryAware: {
      detectedJobs: [{ _id: 'job-2', name: 'Frontend Developer' }],
      detectedCompanies: [
        { _id: 'c1', name: 'Acme', address: 'HCMC', description: 'A', jobCount: 1 },
      ],
      includeStats: false,
    },
    cvReview: {
      hasProfile: true,
      missingFields: [],
      recommendations: [],
    },
    contextJobs: [],
    validJobIds: [],
  };

  it('omits job and company context for CV review prompts', () => {
    const prompt = builder.buildSystemPrompt(baseContext);

    expect(prompt).toContain('INTENT: cv_review');
    expect(prompt).toContain('PROFILE:');
    expect(prompt).not.toContain('YOUR MATCHING JOBS');
    expect(prompt).not.toContain('COMPANY INFO');
    expect(prompt).not.toContain('SEARCH RESULTS');
  });

  it('includes deterministic matching data only for job matching prompts', () => {
    const prompt = builder.buildSystemPrompt({
      ...baseContext,
      intent: EChatIntent.JOB_MATCHING,
      jobMatching: {
        selectedJob: { _id: 'job-1', name: 'Backend Developer', skills: ['NodeJS'] },
        matchResult: { matchingScore: 82 } as any,
      },
      contextJobs: [{ _id: 'job-1', name: 'Backend Developer', skills: ['NodeJS'] }],
      validJobIds: ['job-1'],
    });

    expect(prompt).toContain('SELECTED JOB');
    expect(prompt).toContain('DETERMINISTIC MATCH');
    expect(prompt).toContain('YOUR MATCHING JOBS');
  });
});
