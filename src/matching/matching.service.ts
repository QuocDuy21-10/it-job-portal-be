import { Injectable, Logger } from '@nestjs/common';
import { ParsedDataDto } from 'src/resumes/dto/parsed-data.dto';
import { Job } from 'src/jobs/schemas/job.schema';
import { SkillMatchDto } from './dto/skill-match.dto';
import { 
  MATCHING_WEIGHTS, 
  SCORE_THRESHOLDS, 
  EXPERIENCE_SCORING,
  SKILL_PROFICIENCY_LEVELS,
  MATCHING_RECOMMENDATIONS,
} from './constants/matching.constants';
import { ResumePriority } from 'src/resumes/enums/resume-priority.enum';
import { ResumeStatus } from 'src/resumes/enums/resume-status.enum';
import { JobLevel } from 'src/jobs/enums/job-level.enum';
import { MatchResultDto } from './dto/match-result.dto';

/**
 * MatchingService - Hybrid CV Matching Engine
 * 
 * Trách nhiệm:
 * - Nhận parsedData từ AI (extracted JSON)
 * - Nhận jobInfo từ DB
 * - Tự tính toán matching score dựa trên business rules
 * - Không gọi AI để matching (chỉ AI extract data)
 * 
 * @author Backend Team
 * @architecture Hybrid Parsing Pipeline (AI Extract + Backend Score)
 */
@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  /**
   * Main matching method - Tính toán tổng thể matching score
   * @param parsedCV - Dữ liệu CV đã được AI parse
   * @param job - Thông tin job từ database
   * @returns Match result với score, priority, status, insights
   */
  async calculateMatch(
    parsedCV: ParsedDataDto,
    job: Job,
  ): Promise<MatchResultDto> {
    try {
      this.logger.log(
        `Starting match calculation for job: ${job.name}`,
      );

      // 1. Skills Matching
      const skillsMatchResult = this.calculateSkillsMatch(
        parsedCV.skills || [],
        job.skills || [],
      );

      // 2. Experience Matching
      const experienceScore = this.calculateExperienceScore(
        parsedCV.yearsOfExperience || 0,
        job.level,
      );

      // 3. Education Matching (if applicable)
      const educationScore = this.calculateEducationScore(
        parsedCV.education || [],
        job.level,
      );

      // 4. Calculate weighted total score
      const totalScore = this.calculateWeightedScore(
        skillsMatchResult.scorePercentage,
        experienceScore,
        educationScore,
      );

      // 5. Determine priority
      const priority = this.determinePriority(totalScore);

      // 6. Determine auto status
      // const autoStatus = this.determineAutoStatus(totalScore, skillsMatchResult);

      // 7. Generate strengths and weaknesses
      const { strengths, weaknesses } = this.generateInsights(
        parsedCV,
        job,
        skillsMatchResult,
        experienceScore,
      );

      // 8. Generate recommendation
      const recommendation = this.generateRecommendation(totalScore);

      const result: MatchResultDto = {
        matchingScore: Math.round(totalScore),
        priority,
        // autoStatus,
        skillsMatch: skillsMatchResult.matches,
        skillsMatchPercentage: skillsMatchResult.scorePercentage,
        experienceScore,
        educationScore,
        strengths,
        weaknesses,
        recommendation,
        summary: this.generateSummary(
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

  /**
   * Calculate skills matching score
   * So sánh skills của CV với required skills của job
   */
  private calculateSkillsMatch(
    candidateSkills: string[],
    requiredSkills: string[],
  ): {
    matches: SkillMatchDto[];
    matchedCount: number;
    totalRequired: number;
    scorePercentage: number;
  } {
    const matches: SkillMatchDto[] = [];
    let totalScore = 0;
    let matchedCount = 0;

    // Normalize skills for better matching
    const normalizedCandidateSkills = candidateSkills.map((s) =>
      this.normalizeSkill(s),
    );

    for (const requiredSkill of requiredSkills) {
      const normalizedRequired = this.normalizeSkill(requiredSkill);

      // Check if skill is matched
      const isMatched = normalizedCandidateSkills.some((candidateSkill) =>
        this.isSkillMatch(candidateSkill, normalizedRequired),
      );

      if (isMatched) {
        matchedCount++;
        
        // Determine proficiency based on skill appearance
        const proficiency = this.determineProficiency(
          requiredSkill,
          candidateSkills,
        );
        
        totalScore += SKILL_PROFICIENCY_LEVELS[proficiency];

        matches.push({
          skill: requiredSkill,
          matched: true,
          proficiencyLevel: proficiency,
          score: SKILL_PROFICIENCY_LEVELS[proficiency],
        });
      } else {
        matches.push({
          skill: requiredSkill,
          matched: false,
          proficiencyLevel: 'none',
          score: 0,
        });
      }
    }

    const scorePercentage =
      requiredSkills.length > 0
        ? (totalScore / (requiredSkills.length * 100)) * 100
        : 0;

    return {
      matches,
      matchedCount,
      totalRequired: requiredSkills.length,
      scorePercentage: Math.round(scorePercentage),
    };
  }

  /**
   * Calculate experience score based on years and job level
   */
  private calculateExperienceScore(
    yearsOfExperience: number,
    jobLevel: string,
  ): number {
    const levelConfig = EXPERIENCE_SCORING[jobLevel as JobLevel];

    if (!levelConfig) {
      this.logger.warn(`Unknown job level: ${jobLevel}, using default scoring`);
      return 50; // Default middle score
    }

    const { minYears, maxYears, idealYears } = levelConfig;

    // Below minimum
    if (yearsOfExperience < minYears) {
      const ratio = yearsOfExperience / minYears;
      return Math.round(ratio * 50); // Max 50 points if below minimum
    }

    // Between min and ideal
    if (yearsOfExperience <= idealYears) {
      const range = idealYears - minYears;
      const position = yearsOfExperience - minYears;
      return Math.round(50 + (position / range) * 50); // 50-100 points
    }

    // Between ideal and max
    if (yearsOfExperience <= maxYears) {
      return 100; // Perfect match
    }

    // Over-qualified (slightly penalize)
    const overYears = yearsOfExperience - maxYears;
    const penalty = Math.min(overYears * 2, 15); // Max 15 point penalty
    return Math.max(85, 100 - penalty);
  }

  /**
   * Calculate education score based on degree level and job requirements
   */
  private calculateEducationScore(
    education: any[],
    jobLevel: string,
  ): number {
    if (!education || education.length === 0) {
      return 50; // Neutral score if no education data
    }

    // Determine highest degree
    const degrees = education.map((edu) => edu.degree?.toLowerCase() || '');
    const hasPhd = degrees.some((d) => d.includes('phd') || d.includes('tiến sĩ'));
    const hasMaster = degrees.some(
      (d) => d.includes('master') || d.includes('thạc sĩ'),
    );
    const hasBachelor = degrees.some(
      (d) => d.includes('bachelor') || d.includes('cử nhân') || d.includes('đại học'),
    );

    // Score based on job level
    switch (jobLevel) {
      case JobLevel.INTERN:
        return hasBachelor || hasMaster || hasPhd ? 100 : 75;
      
      case JobLevel.JUNIOR:
        return hasBachelor ? 100 : hasMaster || hasPhd ? 100 : 60;
      
      case JobLevel.MID_LEVEL:
        return hasBachelor ? 90 : hasMaster ? 100 : hasPhd ? 100 : 50;
      
      case JobLevel.SENIOR:
        return hasMaster || hasPhd ? 100 : hasBachelor ? 80 : 40;
      
      case JobLevel.LEAD:
      case JobLevel.MANAGER:
        return hasPhd || hasMaster ? 100 : hasBachelor ? 70 : 30;
      
      default:
        return 50;
    }
  }

  /**
   * Calculate weighted total score
   * Formula: (Skills * 0.5) + (Experience * 0.3) + (Education * 0.2)
   */
  private calculateWeightedScore(
    skillsScore: number,
    experienceScore: number,
    educationScore: number,
  ): number {
    const totalScore =
      skillsScore * MATCHING_WEIGHTS.SKILLS +
      experienceScore * MATCHING_WEIGHTS.EXPERIENCE +
      educationScore * MATCHING_WEIGHTS.EDUCATION;

    return Math.min(100, Math.max(0, totalScore)); // Clamp to 0-100
  }

  /**
   * Determine priority based on matching score
   */
  private determinePriority(matchingScore: number): ResumePriority {
    if (matchingScore >= SCORE_THRESHOLDS.EXCELLENT) {
      return ResumePriority.EXCELLENT;
    }
    if (matchingScore >= SCORE_THRESHOLDS.HIGH) {
      return ResumePriority.HIGH;
    }
    if (matchingScore >= SCORE_THRESHOLDS.MEDIUM) {
      return ResumePriority.MEDIUM;
    }
    return ResumePriority.LOW;
  }

  /**
   * Determine auto status based on score and critical skills
   */
  private determineAutoStatus(
    matchingScore: number,
    skillsMatchResult: any,
  ): ResumeStatus {
    const criticalSkillsMatchRate =
      skillsMatchResult.totalRequired > 0
        ? (skillsMatchResult.matchedCount / skillsMatchResult.totalRequired) * 100
        : 0;

    // Auto-approve if excellent score and good skills match
    if (
      matchingScore >= SCORE_THRESHOLDS.EXCELLENT &&
      criticalSkillsMatchRate >= 70
    ) {
      return ResumeStatus.APPROVED;
    }

    // Auto-reject if very low score and poor skills match
    if (
      matchingScore < SCORE_THRESHOLDS.LOW &&
      criticalSkillsMatchRate < 30
    ) {
      return ResumeStatus.REJECTED;
    }

    // Default to reviewing
    return ResumeStatus.REVIEWING;
  }

  /**
   * Generate insights (strengths and weaknesses)
   */
  private generateInsights(
    parsedCV: ParsedDataDto,
    job: Job,
    skillsMatchResult: any,
    experienceScore: number,
  ): { strengths: string[]; weaknesses: string[] } {
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    // Skills insights
    if (skillsMatchResult.scorePercentage >= 80) {
      strengths.push(
        `Excellent skills match: ${skillsMatchResult.matchedCount}/${skillsMatchResult.totalRequired} required skills`,
      );
    } else if (skillsMatchResult.scorePercentage < 50) {
      weaknesses.push(
        `Limited skills match: Only ${skillsMatchResult.matchedCount}/${skillsMatchResult.totalRequired} required skills`,
      );
    }

    // Experience insights
    if (experienceScore >= 90) {
      strengths.push(
        `Strong experience: ${parsedCV.yearsOfExperience || 0} years matches ${job.level} level`,
      );
    } else if (experienceScore < 50) {
      weaknesses.push(
        `Experience gap: ${parsedCV.yearsOfExperience || 0} years may be insufficient for ${job.level} level`,
      );
    }

    // Additional strengths from CV
    if (parsedCV.education && parsedCV.education.length > 0) {
      const hasAdvancedDegree = parsedCV.education.some(
        (edu) =>
          edu.degree?.toLowerCase().includes('master') ||
          edu.degree?.toLowerCase().includes('phd'),
      );
      if (hasAdvancedDegree) {
        strengths.push('Advanced degree (Master/PhD)');
      }
    }

    return { strengths, weaknesses };
  }

  /**
   * Generate recommendation based on score
   */
  private generateRecommendation(matchingScore: number): string {
    if (matchingScore >= SCORE_THRESHOLDS.EXCELLENT) {
      return MATCHING_RECOMMENDATIONS.HIGHLY_RECOMMENDED;
    }
    if (matchingScore >= SCORE_THRESHOLDS.HIGH) {
      return MATCHING_RECOMMENDATIONS.RECOMMENDED;
    }
    if (matchingScore >= SCORE_THRESHOLDS.MEDIUM) {
      return MATCHING_RECOMMENDATIONS.CONSIDER;
    }
    return MATCHING_RECOMMENDATIONS.NOT_RECOMMENDED;
  }

  /**
   * Generate summary text
   */
  private generateSummary(
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

  /**
   * Normalize skill name for better matching
   */
  private normalizeSkill(skill: string): string {
    return skill
      .toUpperCase()
      .trim()
      .replace(/[^\w\s+#]/g, '') // Keep alphanumeric, spaces, +, #
      .replace(/\s+/g, ' ');
  }

  /**
   * Check if two skills match (fuzzy matching)
   */
  private isSkillMatch(candidateSkill: string, requiredSkill: string): boolean {
    // Exact match
    if (candidateSkill === requiredSkill) {
      return true;
    }

    // Contains match
    if (
      candidateSkill.includes(requiredSkill) ||
      requiredSkill.includes(candidateSkill)
    ) {
      return true;
    }

    // Common variations mapping
    const variations: { [key: string]: string[] } = {
      javascript: ['js', 'es6', 'ecmascript'],
      typescript: ['ts'],
      'react.js': ['react', 'reactjs'],
      'node.js': ['node', 'nodejs'],
      'vue.js': ['vue', 'vuejs'],
      mongodb: ['mongo'],
      postgresql: ['postgres', 'psql'],
      kubernetes: ['k8s'],
      docker: ['containerization'],
    };

    for (const [key, aliases] of Object.entries(variations)) {
      if (
        (candidateSkill === key && aliases.includes(requiredSkill)) ||
        (requiredSkill === key && aliases.includes(candidateSkill))
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Determine proficiency level based on skill context
   */
  private determineProficiency(
    requiredSkill: string,
    candidateSkills: string[],
  ): string {
    const skillText = candidateSkills.join(' ').toLowerCase();
    const normalizedSkill = requiredSkill.toLowerCase();

    // Check for proficiency indicators in CV text
    if (
      skillText.includes(`expert ${normalizedSkill}`) ||
      skillText.includes(`${normalizedSkill} expert`)
    ) {
      return 'expert';
    }

    if (
      skillText.includes(`advanced ${normalizedSkill}`) ||
      skillText.includes(`${normalizedSkill} advanced`) ||
      skillText.includes(`proficient ${normalizedSkill}`)
    ) {
      return 'advanced';
    }

    if (
      skillText.includes(`intermediate ${normalizedSkill}`) ||
      skillText.includes(`working knowledge ${normalizedSkill}`)
    ) {
      return 'intermediate';
    }

    // Default to intermediate if skill is present
    return 'intermediate';
  }
}
