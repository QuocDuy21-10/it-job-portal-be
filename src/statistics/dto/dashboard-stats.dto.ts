import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TrendPointDto {
  @ApiProperty({
    description: 'Date in YYYY-MM-DD format',
    example: '2026-05-11',
  })
  date: string;

  @ApiProperty({
    description: 'Number of items recorded on this date',
    example: 25,
  })
  count: number;
}

export class StatusCountDto {
  @ApiProperty({
    description: 'Resume status label',
    example: 'PENDING',
  })
  status: string;

  @ApiProperty({
    description: 'Number of resumes in this status',
    example: 18,
  })
  count: number;
}

export class TopSkillDemandDto {
  @ApiProperty({
    description: 'Normalized skill name',
    example: 'nestjs',
  })
  skill: string;

  @ApiProperty({
    description: 'How many active approved jobs require this skill',
    example: 42,
  })
  count: number;
}

export class TopJobApplicationsDto {
  @ApiProperty({
    description: 'Job identifier',
    example: '681f35d6203298c6209a5e63',
  })
  jobId: string;

  @ApiProperty({
    description: 'Job display name',
    example: 'Senior Backend Developer',
  })
  jobName: string;

  @ApiProperty({
    description: 'Number of applications received for this job',
    example: 14,
  })
  applicationsCount: number;
}

export class ResumeProcessingHealthDto {
  @ApiProperty({
    description: 'Total number of non-deleted resumes',
    example: 250,
  })
  totalResumes: number;

  @ApiProperty({
    description: 'Resumes successfully parsed',
    example: 220,
  })
  parsedResumes: number;

  @ApiProperty({
    description: 'Resumes with parse failures recorded',
    example: 12,
  })
  parseFailedResumes: number;

  @ApiProperty({
    description: 'Parse success rate as a percentage',
    example: 88,
  })
  parseSuccessRate: number;

  @ApiProperty({
    description: 'Resumes successfully analyzed',
    example: 205,
  })
  analyzedResumes: number;

  @ApiProperty({
    description: 'Resumes with analysis failures recorded',
    example: 9,
  })
  analysisFailedResumes: number;

  @ApiProperty({
    description: 'Analysis success rate as a percentage',
    example: 82,
  })
  analysisSuccessRate: number;
}

export class AdminDashboardStatsDto {
  @ApiProperty({
    description: 'Total jobs created in the last 24 hours',
    example: 45,
  })
  countJobs24h: number;

  @ApiProperty({
    description: 'Approved active jobs that are still open for applications',
    example: 320,
  })
  countActiveJobs: number;

  @ApiProperty({
    description: 'Jobs still waiting for admin approval',
    example: 27,
  })
  countPendingApprovalJobs: number;

  @ApiProperty({
    description: 'Distinct companies currently hiring via approved active jobs',
    example: 85,
  })
  countHiringCompanies: number;

  @ApiProperty({
    description: 'Total non-deleted companies on the platform',
    example: 110,
  })
  countCompanies: number;

  @ApiProperty({
    description: 'Total non-deleted users on the platform',
    example: 1450,
  })
  countUsers: number;

  @ApiProperty({
    description: '7-day job creation trend',
    type: [TrendPointDto],
  })
  jobTrend: TrendPointDto[];

  @ApiProperty({
    description: '7-day application submission trend',
    type: [TrendPointDto],
  })
  applicationTrend: TrendPointDto[];

  @ApiProperty({
    description: 'Most demanded skills across approved active jobs',
    type: [TopSkillDemandDto],
  })
  topDemandedSkills: TopSkillDemandDto[];

  @ApiProperty({
    description: 'Health summary for resume parsing and analysis',
    type: ResumeProcessingHealthDto,
  })
  resumeProcessingHealth: ResumeProcessingHealthDto;

  @ApiProperty({
    description: 'Timestamp when stats were generated',
    example: '2026-05-11T08:30:00.000Z',
  })
  generatedAt: Date;

  @ApiProperty({
    description: 'Whether data was served from cache',
    example: false,
  })
  fromCache: boolean;
}

export class HrDashboardStatsDto {
  @ApiProperty({
    description: 'Approved active jobs for the HR user company',
    example: 12,
  })
  countActiveJobs: number;

  @ApiProperty({
    description: 'Jobs from this company still waiting for approval',
    example: 3,
  })
  countPendingApprovalJobs: number;

  @ApiProperty({
    description: 'Approved jobs from this company whose end date has passed',
    example: 7,
  })
  countExpiredJobs: number;

  @ApiProperty({
    description: 'Total applications received by this company',
    example: 168,
  })
  totalApplications: number;

  @ApiProperty({
    description: 'Applications received in the last 24 hours',
    example: 19,
  })
  countApplications24h: number;

  @ApiProperty({
    description: 'Application funnel grouped by current resume status',
    type: [StatusCountDto],
  })
  applicationStatusDistribution: StatusCountDto[];

  @ApiProperty({
    description: '7-day application submission trend for this company',
    type: [TrendPointDto],
  })
  applicationTrend: TrendPointDto[];

  @ApiProperty({
    description: 'Top jobs by application volume for this company',
    type: [TopJobApplicationsDto],
  })
  topJobsByApplications: TopJobApplicationsDto[];

  @ApiProperty({
    description: 'Percentage of applications that have received a first response',
    example: 72.5,
  })
  responseRate: number;

  @ApiPropertyOptional({
    description: 'Average time in hours from submission to the first non-pending status',
    example: 14.25,
    nullable: true,
  })
  averageFirstResponseHours: number | null;

  @ApiPropertyOptional({
    description: 'Average AI matching score across analyzed resumes for this company',
    example: 76.4,
    nullable: true,
  })
  averageMatchingScore: number | null;

  @ApiProperty({
    description: 'Timestamp when stats were generated',
    example: '2026-05-11T08:30:00.000Z',
  })
  generatedAt: Date;

  @ApiProperty({
    description: 'Whether data was served from cache',
    example: false,
  })
  fromCache: boolean;
}
