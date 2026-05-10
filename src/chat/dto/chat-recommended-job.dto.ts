import { ApiProperty } from '@nestjs/swagger';

export class ChatRecommendedJobCompanyDto {
  @ApiProperty({
    description: 'Company ID',
    example: '507f1f77bcf86cd799439012',
  })
  _id: string;

  @ApiProperty({
    description: 'Company name',
    example: 'Tech Corp',
  })
  name: string;

  @ApiProperty({
    description: 'Company logo URL',
    example: 'https://example.com/logo.png',
    required: false,
  })
  logo?: string;
}

export class ChatRecommendedJobDto {
  @ApiProperty({
    description: 'Job ID',
    example: '507f1f77bcf86cd799439011',
  })
  _id: string;

  @ApiProperty({
    description: 'Job title',
    example: 'Senior NodeJS Developer',
  })
  name: string;

  @ApiProperty({
    description: 'Embedded company snapshot for the job card',
    type: ChatRecommendedJobCompanyDto,
  })
  company: ChatRecommendedJobCompanyDto;

  @ApiProperty({
    description: 'Human-readable location',
    example: 'Ho Chi Minh City',
  })
  location: string;

  @ApiProperty({
    description: 'Canonical location code',
    example: 'ho-chi-minh',
    required: false,
  })
  locationCode?: string;

  @ApiProperty({
    description: 'Skills shown on the job card',
    type: [String],
    example: ['NodeJS', 'NestJS', 'MongoDB'],
  })
  skills: string[];

  @ApiProperty({
    description: 'Job seniority level',
    example: 'SENIOR',
  })
  level: string;

  @ApiProperty({
    description: 'Job salary',
    example: 2500,
    required: false,
  })
  salary?: number;
}
