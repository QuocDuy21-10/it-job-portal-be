import { EJobLevel } from 'src/jobs/enums/job-level.enum';

export interface NormalizedJob {
  name: string;
  skills: string[];
  level: EJobLevel;
}
