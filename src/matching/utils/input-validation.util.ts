import { ParsedDataDto } from 'src/resumes/dto/parsed-data.dto';
import { Job } from 'src/jobs/schemas/job.schema';
import { EJobLevel } from 'src/jobs/enums/job-level.enum';
import { NormalizedJob } from '../interfaces/normalized-job.interface';

export function ensureValidNumber(value: unknown, defaultValue = 0): number {
  const num = Number(value);
  if (isNaN(num) || !isFinite(num)) {
    return defaultValue;
  }
  return Math.max(0, num);
}

export function ensureValidScore(score: number): number {
  if (isNaN(score) || !isFinite(score)) {
    return 0;
  }
  return Math.min(100, Math.max(0, score));
}

export function validateAndNormalizeCV(parsedCV: ParsedDataDto): ParsedDataDto {
  return {
    fullName: parsedCV?.fullName || 'Unknown',
    email: parsedCV?.email || '',
    phone: parsedCV?.phone || '',
    skills: Array.isArray(parsedCV?.skills) ? parsedCV.skills.filter(s => s && s.trim()) : [],
    experience: Array.isArray(parsedCV?.experience) ? parsedCV.experience : [],
    education: Array.isArray(parsedCV?.education) ? parsedCV.education : [],
    summary: parsedCV?.summary || '',
    yearsOfExperience: ensureValidNumber(parsedCV?.yearsOfExperience, 0),
  };
}

export function validateJob(job: Job): NormalizedJob {
  return {
    name: job?.name || 'Unknown Job',
    skills: Array.isArray(job?.skills) ? job.skills.filter(s => s && s.trim()) : [],
    level: (job?.level as EJobLevel) || EJobLevel.JUNIOR,
  };
}
