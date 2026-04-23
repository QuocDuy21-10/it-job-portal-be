import { SkillMatchDto } from './skill-match.dto';
import { EResumePriority } from 'src/resumes/enums/resume-priority.enum';
import { EResumeStatus } from 'src/resumes/enums/resume-status.enum';

export class MatchResultDto {
  matchingScore: number;
  priority: EResumePriority;
  autoStatus: EResumeStatus;
  skillsMatch: SkillMatchDto[];
  skillsMatchPercentage: number;
  experienceScore: number;
  educationScore: number;
  strengths: string[];
  weaknesses: string[];
  recommendation: string;
  summary: string;
  analyzedAt: Date;
}
