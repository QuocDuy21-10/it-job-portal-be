import { ApiProperty } from '@nestjs/swagger';

//  DTO for Salary Distribution Chart (Column Chart)
export class SalaryDistributionDto {
  @ApiProperty({
    description: 'Salary range label',
    example: '10-20 triệu',
  })
  range: string;

  @ApiProperty({
    description: 'Number of jobs in this salary range',
    example: 150,
  })
  count: number;
}

//  DTO for Job Trend Chart (Line Chart - 7 days)
export class JobTrendDto {
  @ApiProperty({
    description: 'Date in YYYY-MM-DD format',
    example: '2025-11-26',
  })
  date: string;

  @ApiProperty({
    description: 'Number of jobs created on this date',
    example: 25,
  })
  count: number;
}

//  Main Dashboard Statistics Response DTO
export class DashboardStatsDto {
  @ApiProperty({
    description: 'Total jobs created in last 24 hours',
    example: 45,
  })
  countJobs24h: number;

  @ApiProperty({
    description: 'Total active jobs (not expired and isActive=true)',
    example: 320,
  })
  countActiveJobs: number;

  @ApiProperty({
    description: 'Total distinct companies currently hiring',
    example: 85,
  })
  countHiringCompanies: number;

  @ApiProperty({
    description: 'Salary distribution data for column chart',
    type: [SalaryDistributionDto],
  })
  salaryDistribution: SalaryDistributionDto[];

  @ApiProperty({
    description: 'Job creation trend for last 7 days (line chart)',
    type: [JobTrendDto],
  })
  jobTrend: JobTrendDto[];

  @ApiProperty({
    description: 'Timestamp when stats were generated',
    example: '2025-11-26T10:30:00.000Z',
  })
  generatedAt: Date;

  @ApiProperty({
    description: 'Whether data is from cache',
    example: false,
  })
  fromCache: boolean;
}
