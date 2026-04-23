import { EJobLevel } from 'src/jobs/enums/job-level.enum';
import { EXPERIENCE_SCORING } from '../constants/matching.constants';

export function calculateExperienceScore(yearsOfExperience: number, jobLevel: EJobLevel): number {
  const levelConfig = EXPERIENCE_SCORING[jobLevel];

  if (!levelConfig) {
    return 50; // Default middle score for unknown level
  }

  const { minYears, maxYears, idealYears } = levelConfig;

  // Below minimum
  if (yearsOfExperience < minYears) {
    if (minYears === 0) return 100; // e.g. INTERN with 0 years is perfect
    const ratio = yearsOfExperience / minYears;
    return Math.round(ratio * 50); // Max 50 points when below minimum
  }

  // Between min and ideal (50–100 range)
  if (yearsOfExperience <= idealYears) {
    const range = idealYears - minYears;
    if (range === 0) return 100; // min === ideal means any qualifying years score 100
    const position = yearsOfExperience - minYears;
    return Math.round(50 + (position / range) * 50);
  }

  // Between ideal and max — perfect match
  if (yearsOfExperience <= maxYears) {
    return 100;
  }

  // Over-qualified: slight penalty, floored at 85
  const overYears = yearsOfExperience - maxYears;
  const penalty = Math.min(overYears * 2, 15); // Max 15 point penalty
  return Math.max(85, 100 - penalty);
}
