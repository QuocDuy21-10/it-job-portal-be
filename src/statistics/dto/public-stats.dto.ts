import { ApiProperty } from '@nestjs/swagger';

export class PublicStatsDto {
  @ApiProperty({ example: 240, description: 'Jobs the public can see now, internal and crawled' })
  activeJobs: number;

  @ApiProperty({ example: 35, description: 'Of those, jobs posted in the last 7 days' })
  newJobsThisWeek: number;

  @ApiProperty({ example: 42, description: 'Companies with at least one visible internal job' })
  hiringCompanies: number;

  @ApiProperty({ example: 1200, description: 'Candidate accounts that are not deleted' })
  candidates: number;
}
