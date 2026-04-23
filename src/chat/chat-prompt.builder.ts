import { Injectable } from '@nestjs/common';
import { FullChatContext } from './interfaces/chat-context.interface';

@Injectable()
export class ChatPromptBuilder {
  buildSystemPrompt(context: FullChatContext, conversationSummary?: string): string {
    const { platform, user: userCtx, queryAware } = context;

    // Personal matching jobs
    const jobsData =
      userCtx.matchingJobs?.map((job: any) => ({
        id: job._id.toString(),
        name: job.name,
        company: job.company?.name || 'N/A',
        location: job.location || 'N/A',
        level: job.level || 'N/A',
        skills: job.skills || [],
      })) || [];

    const profileData = userCtx.profile || {};
    const userName = userCtx.user?.name || 'User';

    // --- Build prompt ---

    let prompt = `ROLE: Expert AI Career Advisor for IT Job Portal (Vietnam).

USER: ${userName}
PROFILE: ${JSON.stringify(profileData)}`;

    // Layer 1: Platform context (always included)
    prompt += `

PLATFORM:
- Active jobs: ${platform.activeJobCount}
- Hiring companies: ${platform.hiringCompaniesCount}
- Top skills: ${platform.topSkills.map(s => `${s.name} (${s.count})`).join(', ') || 'N/A'}
- Top companies: ${platform.topCompanies.map(c => `${c.name} (${c.jobCount} jobs)`).join(', ') || 'N/A'}
- Jobs by level: ${platform.jobsByLevel.map(l => `${l.level}: ${l.count}`).join(', ') || 'N/A'}`;

    // Layer 2: Personal matching jobs
    if (jobsData.length > 0) {
      prompt += `\nYOUR MATCHING JOBS: ${JSON.stringify(jobsData)}`;
    }
    prompt += `\nAPPLIED: ${userCtx.appliedJobsCount || 0}`;

    // Layer 3: Query-aware context
    if (queryAware.detectedJobs.length > 0) {
      const searchJobs = queryAware.detectedJobs.map((job: any) => ({
        id: job._id.toString(),
        name: job.name,
        company: job.company?.name || 'N/A',
        location: job.location || 'N/A',
        level: job.level || 'N/A',
        skills: job.skills || [],
        salary: job.salary || 'N/A',
      }));
      prompt += `\nSEARCH RESULTS: ${JSON.stringify(searchJobs)}`;
    }

    if (queryAware.detectedCompanies.length > 0) {
      const companyInfo = queryAware.detectedCompanies.map(c => ({
        name: c.name,
        address: c.address,
        description: c.description,
        activeJobs: c.jobCount,
      }));
      prompt += `\nCOMPANY INFO: ${JSON.stringify(companyInfo)}`;
    }

    if (conversationSummary) {
      prompt += `\nPREVIOUS CONTEXT: ${conversationSummary}`;
    }

    prompt += `

RULES:
1. SCOPE: Only answer about IT careers, jobs, CVs, interviews, skills, salary in Vietnam IT market. Politely refuse off-topic requests.
2. JOBS: Recommend jobs from YOUR MATCHING JOBS and SEARCH RESULTS. Include matching job IDs in recommendedJobIds. Never fabricate job listings.
3. PLATFORM: Use PLATFORM data to answer general questions about job market stats, available skills, hiring trends, and company counts.
4. COMPANIES: Use COMPANY INFO to answer questions about specific companies. If company data is available, reference it. If not, acknowledge you don't have info about that company.
5. ACCURACY: Only reference real data from user profile, provided jobs, and platform data. Acknowledge missing data honestly.
6. TONE: Professional, encouraging, concise. Match user's language (Vietnamese/English). Use Markdown. Keep under 300 words unless detailed analysis requested.
7. PRIVACY: Never discuss other users' data.`;

    return prompt;
  }
}
