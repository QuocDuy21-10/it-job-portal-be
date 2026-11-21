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

  it('requires readable and proofread assistant answers', () => {
    const prompt = builder.buildSystemPrompt(baseContext);

    expect(prompt).toContain('Proofread spelling and grammar before finalizing.');
    expect(prompt).toContain('Start with the direct answer');
    expect(prompt).toContain('separate follow-up questions with a blank line');
    expect(prompt).toContain('Avoid dense single-paragraph responses');
  });

  it('includes Vietnamese language quality instruction in rules', () => {
    const prompt = builder.buildSystemPrompt(baseContext);

    expect(prompt).toContain('Vietnamese');
    expect(prompt).toContain('diacritical marks');
  });

  describe('job statistics and accuracy rules', () => {
    const jobContext: IntentAwareChatContext = {
      ...baseContext,
      intent: EChatIntent.JOB_ADVISOR,
      queryAware: {
        ...baseContext.queryAware,
        detectedJobs: [{ _id: 'job-2', name: 'Node Developer', salary: 1 }],
        jobStats: {
          skills: ['Node.js'],
          total: 38,
          shown: 1,
          highestSalary: { id: 'job-top', name: 'Lead', company: 'VNG', salary: 173500000 },
        },
      },
    };

    it('prints SEARCH STATS before SEARCH RESULTS', () => {
      const prompt = builder.buildSystemPrompt(jobContext);

      expect(prompt).toContain('SEARCH STATS: {"skills":["Node.js"],"total":38');
      expect(prompt.indexOf('SEARCH STATS')).toBeLessThan(prompt.indexOf('SEARCH RESULTS'));
    });

    it('omits SEARCH STATS when there are none', () => {
      const prompt = builder.buildSystemPrompt({
        ...jobContext,
        queryAware: { ...jobContext.queryAware, jobStats: undefined },
      });

      expect(prompt).not.toContain('SEARCH STATS: ');
    });

    it('tells the model not to count list items and not to invent user facts', () => {
      const prompt = builder.buildSystemPrompt(jobContext);

      expect(prompt).toContain('State a total only when SEARCH STATS provides `total`');
      expect(prompt).toContain('Never infer or fill in missing personal facts');
    });

    it('teaches the model to propose saving a listed job instead of refusing', () => {
      const prompt = builder.buildSystemPrompt(jobContext);

      expect(prompt).toContain('never say you cannot save jobs');
    });
  });
});
