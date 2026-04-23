import { Injectable, Logger } from '@nestjs/common';
import { ParsedDataDto } from 'src/resumes/dto/parsed-data.dto';
import { Job } from 'src/jobs/schemas/job.schema';
import { MATCHING_WEIGHTS, SCORE_THRESHOLDS } from './constants/matching.constants';
import { EResumePriority } from 'src/resumes/enums/resume-priority.enum';
import { MatchResultDto } from './dto/match-result.dto';
import {
  validateAndNormalizeCV,
  validateJob,
  ensureValidScore,
} from './utils/input-validation.util';
import { calculateSkillsMatch } from './utils/skill-matching.util';
import { calculateExperienceScore } from './utils/experience-scoring.util';
import { calculateEducationScore } from './utils/education-scoring.util';
import {
  generateInsights,
  generateRecommendation,
  generateSummary,
} from './utils/insight-generator.util';
import { determineAutoStatus } from './utils/auto-status.util';

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  async calculateMatch(parsedCV: ParsedDataDto, job: Job): Promise<MatchResultDto> {
    try {
      this.logger.log(`Starting match calculation for job: ${job.name}`);

      // 1. Validate and normalise inputs
      const normalizedCV = validateAndNormalizeCV(parsedCV);
      const normalizedJob = validateJob(job);

      // 2. Score each dimension
      const skillsMatchResult = calculateSkillsMatch(
        normalizedCV.skills ?? [],
        normalizedJob.skills,
      );
      const experienceScore = calculateExperienceScore(
        normalizedCV.yearsOfExperience ?? 0,
        normalizedJob.level,
      );
      const educationScore = calculateEducationScore(normalizedCV.education, normalizedJob.level);

      // 3. Weighted total (NaN-safe via ensureValidScore)
      const totalScore = Math.min(
        100,
        Math.max(
          0,
          ensureValidScore(skillsMatchResult.scorePercentage) * MATCHING_WEIGHTS.SKILLS +
            ensureValidScore(experienceScore) * MATCHING_WEIGHTS.EXPERIENCE +
            ensureValidScore(educationScore) * MATCHING_WEIGHTS.EDUCATION,
        ),
      );

      // 4. Derive priority, auto-status, insights
      const priority = this.determinePriority(totalScore);
      const autoStatus = determineAutoStatus(totalScore, skillsMatchResult.scorePercentage);
      const { strengths, weaknesses } = generateInsights(
        normalizedCV,
        normalizedJob,
        skillsMatchResult,
        experienceScore,
      );

      const result: MatchResultDto = {
        matchingScore: Math.round(totalScore),
        priority,
        autoStatus,
        skillsMatch: skillsMatchResult.matches,
        skillsMatchPercentage: skillsMatchResult.scorePercentage,
        experienceScore,
        educationScore,
        strengths,
        weaknesses,
        recommendation: generateRecommendation(totalScore),
        summary: generateSummary(
          totalScore,
          skillsMatchResult.matchedCount,
          skillsMatchResult.totalRequired,
        ),
        analyzedAt: new Date(),
      };

      this.logger.log(
        `Match calculation completed - Score: ${result.matchingScore}, Priority: ${priority}`,
      );

      return result;
    } catch (error) {
      this.logger.error('Error calculating match:', error);
      throw error;
    }
  }

  private determinePriority(matchingScore: number): EResumePriority {
    if (matchingScore >= SCORE_THRESHOLDS.EXCELLENT) return EResumePriority.EXCELLENT;
    if (matchingScore >= SCORE_THRESHOLDS.HIGH) return EResumePriority.HIGH;
    if (matchingScore >= SCORE_THRESHOLDS.MEDIUM) return EResumePriority.MEDIUM;
    return EResumePriority.LOW;
  }
}
