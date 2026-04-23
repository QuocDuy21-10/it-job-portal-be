import { ParsedDataDto } from 'src/resumes/dto/parsed-data.dto';
import { NormalizedJob } from '../interfaces/normalized-job.interface';
import { SkillsMatchResult } from './skill-matching.util';
import { SCORE_THRESHOLDS, MATCHING_RECOMMENDATIONS } from '../constants/matching.constants';

export function generateInsights(
  parsedCV: ParsedDataDto,
  job: NormalizedJob,
  skillsResult: SkillsMatchResult,
  experienceScore: number,
): { strengths: string[]; weaknesses: string[] } {
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (skillsResult.scorePercentage >= 80) {
    strengths.push(
      `Excellent skills match: ${skillsResult.matchedCount}/${skillsResult.totalRequired} required skills`,
    );
  } else if (skillsResult.scorePercentage < 50) {
    weaknesses.push(
      `Limited skills match: Only ${skillsResult.matchedCount}/${skillsResult.totalRequired} required skills`,
    );
  }

  if (experienceScore >= 90) {
    strengths.push(
      `Strong experience: ${parsedCV.yearsOfExperience ?? 0} years matches ${job.level} level`,
    );
  } else if (experienceScore < 50) {
    weaknesses.push(
      `Experience gap: ${parsedCV.yearsOfExperience ?? 0} years may be insufficient for ${job.level} level`,
    );
  }

  if (parsedCV.education && parsedCV.education.length > 0) {
    const hasAdvancedDegree = parsedCV.education.some(
      edu =>
        edu.degree?.toLowerCase().includes('master') || edu.degree?.toLowerCase().includes('phd'),
    );
    if (hasAdvancedDegree) {
      strengths.push('Advanced degree (Master/PhD)');
    }
  }

  return { strengths, weaknesses };
}

export function generateRecommendation(matchingScore: number): string {
  if (matchingScore >= SCORE_THRESHOLDS.EXCELLENT)
    return MATCHING_RECOMMENDATIONS.HIGHLY_RECOMMENDED;
  if (matchingScore >= SCORE_THRESHOLDS.HIGH) return MATCHING_RECOMMENDATIONS.RECOMMENDED;
  if (matchingScore >= SCORE_THRESHOLDS.MEDIUM) return MATCHING_RECOMMENDATIONS.CONSIDER;
  return MATCHING_RECOMMENDATIONS.NOT_RECOMMENDED;
}

export function generateSummary(
  matchingScore: number,
  matchedSkills: number,
  totalSkills: number,
): string {
  const percentage = Math.round(matchingScore);
  const skillMatch = `${matchedSkills}/${totalSkills}`;

  if (percentage >= 85) {
    return `Excellent match (${percentage}%) - Candidate meets ${skillMatch} required skills. Highly recommended for interview.`;
  }
  if (percentage >= 70) {
    return `Good match (${percentage}%) - Candidate has ${skillMatch} required skills. Recommended for consideration.`;
  }
  if (percentage >= 50) {
    return `Moderate match (${percentage}%) - Candidate has ${skillMatch} required skills. Review carefully before deciding.`;
  }
  return `Limited match (${percentage}%) - Candidate has only ${skillMatch} required skills. May not be suitable for this position.`;
}
