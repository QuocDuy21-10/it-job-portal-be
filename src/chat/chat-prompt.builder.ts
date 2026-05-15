import { Injectable } from '@nestjs/common';
import { EChatIntent } from './enums/chat-intent.enum';
import { IntentAwareChatContext } from './interfaces/chat-context.interface';

@Injectable()
export class ChatPromptBuilder {
  buildSystemPrompt(context: IntentAwareChatContext, conversationSummary?: string): string {
    const userName = context.user.user?.name || 'User';
    const sections = [
      `ROLE: Expert AI Career Advisor for Dev Link (Vietnam).`,
      `INTENT: ${context.intent}`,
      `USER: ${userName}`,
      this.buildIntentSection(context),
      conversationSummary ? `PREVIOUS CONTEXT: ${conversationSummary}` : '',
      this.buildRules(context.intent),
    ].filter(Boolean);

    return sections.join('\n\n');
  }

  private buildIntentSection(context: IntentAwareChatContext): string {
    switch (context.intent) {
      case EChatIntent.JOB_ADVISOR:
        return this.buildJobAdvisorSection(context);
      case EChatIntent.COMPANY_INFO:
        return this.buildCompanySection(context);
      case EChatIntent.CV_REVIEW:
        return this.buildCvReviewSection(context);
      case EChatIntent.JOB_MATCHING:
        return this.buildJobMatchingSection(context);
      case EChatIntent.FAQ:
        return context.faq ? `FAQ: ${JSON.stringify(context.faq)}` : '';
      case EChatIntent.RECRUITER_SUPPORT:
        return 'RECRUITER SUPPORT: Provide general recruiter guidance only. Do not expose candidate private data.';
      default:
        return 'GENERAL CONTEXT: Answer only if the request is about IT careers, jobs, CVs, interviews, or hiring.';
    }
  }

  private buildJobAdvisorSection(context: IntentAwareChatContext): string {
    const lines = [
      context.platform ? this.buildPlatformSection(context) : '',
      context.user.profile ? `PROFILE: ${JSON.stringify(context.user.profile)}` : '',
      context.user.matchingJobs.length > 0
        ? `YOUR MATCHING JOBS: ${JSON.stringify(this.serializeJobs(context.user.matchingJobs))}`
        : '',
      `APPLIED: ${context.user.appliedJobsCount || 0}`,
      context.queryAware.detectedJobs.length > 0
        ? `SEARCH RESULTS: ${JSON.stringify(this.serializeJobs(context.queryAware.detectedJobs))}`
        : '',
    ];

    return lines.filter(Boolean).join('\n');
  }

  private buildCompanySection(context: IntentAwareChatContext): string {
    const lines = [
      context.platform ? this.buildPlatformSection(context) : '',
      context.queryAware.detectedCompanies.length > 0
        ? `COMPANY INFO: ${JSON.stringify(
            context.queryAware.detectedCompanies.map(company => ({
              name: company.name,
              address: company.address,
              description: company.description,
              activeJobs: company.jobCount,
            })),
          )}`
        : '',
      context.queryAware.detectedJobs.length > 0
        ? `SEARCH RESULTS: ${JSON.stringify(this.serializeJobs(context.queryAware.detectedJobs))}`
        : '',
    ];

    return lines.filter(Boolean).join('\n');
  }

  private buildCvReviewSection(context: IntentAwareChatContext): string {
    return [
      context.user.profile ? `PROFILE: ${JSON.stringify(context.user.profile)}` : 'PROFILE: N/A',
      context.cvReview ? `CV REVIEW SIGNALS: ${JSON.stringify(context.cvReview)}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildJobMatchingSection(context: IntentAwareChatContext): string {
    return [
      context.user.profile ? `PROFILE: ${JSON.stringify(context.user.profile)}` : 'PROFILE: N/A',
      context.jobMatching?.selectedJob
        ? `SELECTED JOB: ${JSON.stringify(this.serializeJob(context.jobMatching.selectedJob))}`
        : '',
      context.jobMatching?.matchResult
        ? `DETERMINISTIC MATCH: ${JSON.stringify(context.jobMatching.matchResult)}`
        : '',
      context.jobMatching?.missingReason
        ? `MATCHING STATUS: ${context.jobMatching.missingReason}`
        : '',
      context.contextJobs.length > 0
        ? `YOUR MATCHING JOBS: ${JSON.stringify(this.serializeJobs(context.contextJobs))}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildPlatformSection(context: IntentAwareChatContext): string {
    const platform = context.platform;
    if (!platform) {
      return '';
    }

    return [
      'PLATFORM:',
      `- Active jobs: ${platform.activeJobCount}`,
      `- Hiring companies: ${platform.hiringCompaniesCount}`,
      `- Top skills: ${platform.topSkills.map(s => `${s.name} (${s.count})`).join(', ') || 'N/A'}`,
      `- Top companies: ${
        platform.topCompanies.map(c => `${c.name} (${c.jobCount} jobs)`).join(', ') || 'N/A'
      }`,
      `- Jobs by level: ${
        platform.jobsByLevel.map(level => `${level.level}: ${level.count}`).join(', ') || 'N/A'
      }`,
    ].join('\n');
  }

  private buildRules(intent: EChatIntent): string {
    const jobRule =
      intent === EChatIntent.JOB_ADVISOR || intent === EChatIntent.JOB_MATCHING
        ? '2. JOBS: When recommending specific jobs, call `recommend_jobs` with exact job IDs from YOUR MATCHING JOBS, SEARCH RESULTS, or SELECTED JOB. Never fabricate job IDs.'
        : '2. JOBS: Do not recommend specific job IDs unless they are present in provided context.';

    return [
      'RULES:',
      '1. SCOPE: Only answer about IT careers, jobs, CVs, interviews, skills, salary, companies, and hiring in Vietnam IT market. Politely refuse off-topic requests.',
      jobRule,
      '3. ACCURACY: Only reference real data from provided context. Acknowledge missing data honestly.',
      '4. PRIVACY: Never discuss other users data, private candidate data, or hidden recruiter data.',
      '5. LANGUAGE: Respond in the same language as the user\'s message. For Vietnamese: use correct diacritical marks (ă, â, ê, ô, ơ, ư, and all tone marks) — never drop or corrupt accent marks. Proofread spelling and grammar before finalizing.',
      '6. FORMAT: Use readable Markdown. Start with the direct answer, separate follow-up questions with a blank line, and use bullet lists for 3+ related items. Never write more than 3 consecutive sentences in a single paragraph.',
      '7. READABILITY: Avoid dense single-paragraph responses when the answer has multiple points. Keep under 300 words unless detailed analysis is requested.',
    ].join('\n');
  }

  private serializeJobs(jobs: any[]): Array<Record<string, unknown>> {
    return jobs.map(job => this.serializeJob(job));
  }

  private serializeJob(job: any): Record<string, unknown> {
    return {
      id: job._id?.toString?.() ?? String(job._id ?? ''),
      name: job.name,
      company: job.company?.name || 'N/A',
      location: job.location || 'N/A',
      level: job.level || 'N/A',
      skills: job.skills || [],
      salary: job.salary || 'N/A',
    };
  }
}
