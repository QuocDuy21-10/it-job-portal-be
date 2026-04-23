import { EResumeStatus } from 'src/resumes/enums/resume-status.enum';
import { AUTO_STATUS_RULES } from '../constants/matching.constants';

export function determineAutoStatus(
  totalScore: number,
  skillsScorePercentage: number,
): EResumeStatus {
  if (
    totalScore >= AUTO_STATUS_RULES.AUTO_APPROVE.MIN_SCORE &&
    skillsScorePercentage >= AUTO_STATUS_RULES.AUTO_APPROVE.MIN_CRITICAL_SKILLS_RATE
  ) {
    return EResumeStatus.APPROVED;
  }

  if (
    totalScore < AUTO_STATUS_RULES.AUTO_REJECT.MAX_SCORE &&
    skillsScorePercentage < AUTO_STATUS_RULES.AUTO_REJECT.MAX_CRITICAL_SKILLS_RATE
  ) {
    return EResumeStatus.REJECTED;
  }

  return EResumeStatus.REVIEWING;
}
