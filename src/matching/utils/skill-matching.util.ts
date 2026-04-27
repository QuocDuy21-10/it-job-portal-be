import { SkillMatchDto } from '../dto/skill-match.dto';
import { SKILL_PROFICIENCY_LEVELS } from '../constants/matching.constants';

export interface SkillsMatchResult {
  matches: SkillMatchDto[];
  matchedCount: number;
  totalRequired: number;
  scorePercentage: number;
}

export function normalizeSkill(skill: string): string {
  return skill
    .toUpperCase()
    .trim()
    .replace(/[^\w\s+#]/g, '') // Keep alphanumeric, spaces, +, #
    .replace(/\s+/g, ' ');
}

export function resolveCanonicalSkill(
  skill: string,
  aliasMap: Record<string, string> = {},
): string {
  const normalizedSkill = normalizeSkill(skill);
  const canonicalSkill = aliasMap[normalizedSkill.toLowerCase()];

  return canonicalSkill ? normalizeSkill(canonicalSkill) : normalizedSkill;
}

export function isSkillMatch(candidateSkill: string, requiredSkill: string): boolean {
  if (candidateSkill === requiredSkill) return true;
  if (candidateSkill.includes(requiredSkill) || requiredSkill.includes(candidateSkill)) return true;

  return false;
}

export function determineProficiency(requiredSkill: string, candidateSkills: string[]): string {
  const skillText = candidateSkills.join(' ').toLowerCase();
  const normalizedSkill = requiredSkill.toLowerCase();

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

  return 'intermediate';
}

export function calculateSkillsMatch(
  candidateSkills: string[],
  requiredSkills: string[],
  aliasMap: Record<string, string> = {},
): SkillsMatchResult {
  const matches: SkillMatchDto[] = [];
  let totalScore = 0;
  let matchedCount = 0;

  const normalizedCandidateSkills = candidateSkills.map(skill =>
    resolveCanonicalSkill(skill, aliasMap),
  );

  for (const requiredSkill of requiredSkills) {
    const normalizedRequired = resolveCanonicalSkill(requiredSkill, aliasMap);
    const isMatched = normalizedCandidateSkills.some(cs => isSkillMatch(cs, normalizedRequired));

    if (isMatched) {
      matchedCount++;
      const proficiency = determineProficiency(requiredSkill, candidateSkills);
      const score =
        SKILL_PROFICIENCY_LEVELS[proficiency as keyof typeof SKILL_PROFICIENCY_LEVELS] ?? 0;
      totalScore += score;
      matches.push({ skill: requiredSkill, matched: true, proficiencyLevel: proficiency, score });
    } else {
      matches.push({ skill: requiredSkill, matched: false, proficiencyLevel: 'none', score: 0 });
    }
  }

  let scorePercentage = 0;
  if (requiredSkills.length > 0) {
    const maxPossibleScore = requiredSkills.length * 100;
    const raw = (totalScore / maxPossibleScore) * 100;
    scorePercentage = isNaN(raw) || !isFinite(raw) ? 0 : raw;
  }

  return {
    matches,
    matchedCount,
    totalRequired: requiredSkills.length,
    scorePercentage: Math.round(Math.max(0, Math.min(100, scorePercentage))),
  };
}
