import { JobLevel } from 'src/jobs/enums/job-level.enum';

/**
 * MATCHING CONSTANTS
 * 
 * Tất cả các hằng số, weights, thresholds cho matching logic
 * Dễ dàng điều chỉnh business rules mà không cần sửa code logic
 */

// ===== SCORING WEIGHTS =====
export const MATCHING_WEIGHTS = {
  SKILLS: 0.5,        // 50% trọng số cho skills matching
  EXPERIENCE: 0.3,    // 30% trọng số cho experience
  EDUCATION: 0.2,     // 20% trọng số cho education
} as const;

// ===== SCORE THRESHOLDS =====
export const SCORE_THRESHOLDS = {
  EXCELLENT: 85,  // >= 85: Excellent candidate
  HIGH: 70,       // >= 70: Good candidate
  MEDIUM: 50,     // >= 50: Consider candidate
  LOW: 30,        // < 30: Not recommended
} as const;

// ===== SKILL PROFICIENCY LEVELS =====
export const SKILL_PROFICIENCY_LEVELS = {
  expert: 100,
  advanced: 85,
  intermediate: 70,
  beginner: 50,
  none: 0,
} as const;

// ===== EXPERIENCE SCORING BY JOB LEVEL =====
export const EXPERIENCE_SCORING: Record<
  JobLevel,
  { minYears: number; maxYears: number; idealYears: number }
> = {
  [JobLevel.INTERN]: {
    minYears: 0,
    maxYears: 1,
    idealYears: 0,
  },
  [JobLevel.JUNIOR]: {
    minYears: 1,
    maxYears: 3,
    idealYears: 2,
  },
  [JobLevel.MID_LEVEL]: {
    minYears: 2,
    maxYears: 5,
    idealYears: 3,
  },
  [JobLevel.SENIOR]: {
    minYears: 4,
    maxYears: 10,
    idealYears: 6,
  },
  [JobLevel.LEAD]: {
    minYears: 5,
    maxYears: 15,
    idealYears: 8,
  },
  [JobLevel.MANAGER]: {
    minYears: 6,
    maxYears: 20,
    idealYears: 10,
  },
};

// ===== MATCHING RECOMMENDATIONS =====
export const MATCHING_RECOMMENDATIONS = {
  HIGHLY_RECOMMENDED: 'HIGHLY_RECOMMENDED',
  RECOMMENDED: 'RECOMMENDED',
  CONSIDER: 'CONSIDER',
  NOT_RECOMMENDED: 'NOT_RECOMMENDED',
} as const;

// ===== AUTO STATUS THRESHOLDS =====
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

// ===== SKILL MATCHING ALIASES =====
// Các biến thể skill name để fuzzy matching tốt hơn
export const SKILL_VARIATIONS: Record<string, string[]> = {
  javascript: ['js', 'es6', 'ecmascript', 'es2015', 'es2020'],
  typescript: ['ts'],
  'react.js': ['react', 'reactjs', 'react js'],
  'react native': ['reactnative', 'rn'],
  'node.js': ['node', 'nodejs', 'node js'],
  'vue.js': ['vue', 'vuejs', 'vue js'],
  'angular': ['angularjs', 'angular.js'],
  'next.js': ['next', 'nextjs'],
  mongodb: ['mongo', 'mongo db'],
  postgresql: ['postgres', 'psql', 'pg'],
  mysql: ['my sql'],
  kubernetes: ['k8s'],
  docker: ['containerization', 'containers'],
  'c#': ['csharp', 'c sharp'],
  'c++': ['cpp', 'cplusplus'],
  '.net': ['dotnet', 'asp.net', 'aspnet'],
  'machine learning': ['ml', 'machinelearning'],
  'artificial intelligence': ['ai'],
  'natural language processing': ['nlp'],
  tensorflow: ['tf'],
  pytorch: ['torch'],
};
