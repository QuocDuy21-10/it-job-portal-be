import { EJobLevel } from 'src/jobs/enums/job-level.enum';
import { ParsedEducationDto } from 'src/resumes/dto/parsed-data.dto';

type EducationScoreFn = (hasPhd: boolean, hasMaster: boolean, hasBachelor: boolean) => number;

const EDUCATION_SCORE_BY_LEVEL: Record<EJobLevel, EducationScoreFn> = {
  [EJobLevel.INTERN]: (hasPhd, hasMaster, hasBachelor) =>
    hasPhd || hasMaster || hasBachelor ? 100 : 75,

  [EJobLevel.JUNIOR]: (hasPhd, hasMaster, hasBachelor) =>
    hasPhd || hasMaster || hasBachelor ? 100 : 60,

  // hasBachelor scores 90 (not 100) at mid-level; advanced degrees score 100
  [EJobLevel.MID_LEVEL]: (hasPhd, hasMaster, hasBachelor) =>
    hasBachelor ? 90 : hasPhd || hasMaster ? 100 : 50,

  [EJobLevel.SENIOR]: (hasPhd, hasMaster, hasBachelor) =>
    hasPhd || hasMaster ? 100 : hasBachelor ? 80 : 40,

  [EJobLevel.LEAD]: (hasPhd, hasMaster, hasBachelor) =>
    hasPhd || hasMaster ? 100 : hasBachelor ? 70 : 30,

  [EJobLevel.MANAGER]: (hasPhd, hasMaster, hasBachelor) =>
    hasPhd || hasMaster ? 100 : hasBachelor ? 70 : 30,
};

export function calculateEducationScore(
  education: ParsedEducationDto[] | undefined,
  jobLevel: EJobLevel,
): number {
  if (!education || education.length === 0) {
    return 50; // Neutral score when no education data is available
  }

  const degrees = education.map(edu => edu.degree?.toLowerCase() ?? '');
  const hasPhd = degrees.some(d => d.includes('phd') || d.includes('tiến sĩ'));
  const hasMaster = degrees.some(d => d.includes('master') || d.includes('thạc sĩ'));
  const hasBachelor = degrees.some(
    d => d.includes('bachelor') || d.includes('cử nhân') || d.includes('đại học'),
  );

  const scoreFn = EDUCATION_SCORE_BY_LEVEL[jobLevel];
  return scoreFn ? scoreFn(hasPhd, hasMaster, hasBachelor) : 50;
}
