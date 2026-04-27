import { EJobLevel } from 'src/jobs/enums/job-level.enum';

export const MATCHING_WEIGHTS = {
  SKILLS: 0.5, // 50% trọng số cho skills matching
  EXPERIENCE: 0.3, // 30% trọng số cho experience
  EDUCATION: 0.2, // 20% trọng số cho education
} as const;

export const SCORE_THRESHOLDS = {
  EXCELLENT: 85,
  HIGH: 70,
  MEDIUM: 50,
  LOW: 30,
} as const;

export const SKILL_PROFICIENCY_LEVELS = {
  expert: 100,
  advanced: 85,
  intermediate: 70,
  beginner: 50,
  none: 0,
} as const;

export const EXPERIENCE_SCORING: Record<
  EJobLevel,
  { minYears: number; maxYears: number; idealYears: number }
> = {
  [EJobLevel.INTERN]: {
    minYears: 0,
    maxYears: 1,
    idealYears: 0,
  },
  [EJobLevel.JUNIOR]: {
    minYears: 1,
    maxYears: 3,
    idealYears: 2,
  },
  [EJobLevel.MID_LEVEL]: {
    minYears: 2,
    maxYears: 5,
    idealYears: 3,
  },
  [EJobLevel.SENIOR]: {
    minYears: 4,
    maxYears: 10,
    idealYears: 6,
  },
  [EJobLevel.LEAD]: {
    minYears: 5,
    maxYears: 15,
    idealYears: 8,
  },
  [EJobLevel.MANAGER]: {
    minYears: 6,
    maxYears: 20,
    idealYears: 10,
  },
};

export const MATCHING_RECOMMENDATIONS = {
  HIGHLY_RECOMMENDED: 'HIGHLY_RECOMMENDED',
  RECOMMENDED: 'RECOMMENDED',
  CONSIDER: 'CONSIDER',
  NOT_RECOMMENDED: 'NOT_RECOMMENDED',
} as const;

export const AUTO_STATUS_RULES = {
  AUTO_APPROVE: {
    MIN_SCORE: 85,
    MIN_CRITICAL_SKILLS_RATE: 70,
  },
  AUTO_REJECT: {
    MAX_SCORE: 30,
    MAX_CRITICAL_SKILLS_RATE: 30,
  },
} as const;
