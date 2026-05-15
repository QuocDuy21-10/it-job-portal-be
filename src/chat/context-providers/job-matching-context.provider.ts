import { Injectable, Logger } from '@nestjs/common';
import { ParsedDataDto } from 'src/resumes/dto/parsed-data.dto';
import { JobsService } from 'src/jobs/jobs.service';
import { MatchingService } from 'src/matching/matching.service';
import { EChatIntent } from '../enums/chat-intent.enum';
import { ChatContextService } from '../chat-context.service';
import { IntentAwareChatContext, UserContext } from '../interfaces/chat-context.interface';
import { ChatContextProviderInput } from './chat-context-provider.interface';
import { EMPTY_QUERY_AWARE_CONTEXT, jobIds, uniqueJobs } from './base-chat-context.provider';

@Injectable()
export class JobMatchingContextProvider {
  private readonly logger = new Logger(JobMatchingContextProvider.name);

  constructor(
    private readonly chatContextService: ChatContextService,
    private readonly jobsService: JobsService,
    private readonly matchingService: MatchingService,
  ) {}

  async build(input: ChatContextProviderInput): Promise<IntentAwareChatContext> {
    const user = await this.chatContextService.buildUserContext(input.user._id);
    const selectedJob = await this.resolveSelectedJob(input.jobId);
    const fallbackJobs = selectedJob ? [] : user.matchingJobs;
    const contextJobs = uniqueJobs([selectedJob, ...fallbackJobs].filter(Boolean));
    const jobMatching = await this.buildJobMatch(user, selectedJob);

    return {
      intent: EChatIntent.JOB_MATCHING,
      user,
      queryAware: EMPTY_QUERY_AWARE_CONTEXT,
      jobMatching,
      contextJobs,
      validJobIds: jobIds(contextJobs),
    };
  }

  private async resolveSelectedJob(jobId?: string): Promise<any | null> {
    if (!jobId) {
      return null;
    }

    const [job] = await this.jobsService.findPublicChatCardJobsByIds([jobId]);
    return job ?? null;
  }

  private async buildJobMatch(user: UserContext, selectedJob: any | null) {
    if (!user.profile) {
      return {
        selectedJob,
        missingReason: 'User does not have a CV profile yet.',
      };
    }

    if (!selectedJob) {
      return {
        selectedJob,
        missingReason: 'No jobId was provided for deterministic CV-job matching.',
      };
    }

    try {
      return {
        selectedJob,
        matchResult: await this.matchingService.calculateMatch(this.toParsedCv(user), selectedJob),
      };
    } catch (error) {
      this.logger.warn(
        'Unable to calculate deterministic chat match result',
        error instanceof Error ? error.stack : String(error),
      );
      return {
        selectedJob,
        missingReason: 'Match calculation failed for this job.',
      };
    }
  }

  private toParsedCv(user: UserContext): ParsedDataDto {
    const profile = user.profile;

    return {
      fullName: user.user?.name,
      email: user.user?.email,
      skills: profile?.skills ?? [],
      experience: (profile?.experience ?? []).map(item => ({
        company: item.company,
        position: item.position,
        duration: [item.startDate, item.endDate].filter(Boolean).join(' - '),
        description: item.description,
      })),
      education: (profile?.education ?? []).map(item => ({
        school: item.school,
        degree: item.degree,
        major: item.field,
        duration: [item.startDate, item.endDate].filter(Boolean).join(' - '),
      })),
      summary: profile?.summary,
      yearsOfExperience: profile?.yearsOfExperience,
    };
  }
}
