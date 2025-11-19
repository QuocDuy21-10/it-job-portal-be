import { Res } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { ResumeStatus } from '../enums/resume-status.enum';
import { ResumePriority } from '../enums/resume-priority.enum';
import { ParsedDataDto } from './parsed-data.dto';
import { AIAnalysisDto } from './ai-analysis.dto';

export class UpdateResumeDto {
  @IsNotEmpty({ message: 'Status should not be empty' })
  @Type(() => String)
  @IsEnum(ResumeStatus, {
    message: `Status must be one of the following values: ${Object.values(ResumeStatus).join(', ')}`,
  })
  @ApiProperty({ example: ResumeStatus.PENDING, description: 'Status of resume' })
  @IsString({ message: 'Status must be a string' })
  @IsOptional()
  status?: string;

  // NEW: CV Parser & AI Analysis fields
  @ValidateNested()
  @Type(() => ParsedDataDto)
  @IsOptional()
  parsedData?: ParsedDataDto;

  @ValidateNested()
  @Type(() => AIAnalysisDto)
  @IsOptional()
  aiAnalysis?: AIAnalysisDto;

  @IsEnum(ResumePriority)
  @IsOptional()
  priority?: string;

  @IsString()
  @IsOptional()
  adminNotes?: string;

  @IsString()
  @IsOptional()
  hrNotes?: string;

  @IsBoolean()
  @IsOptional()
  isParsed?: boolean;

  @IsBoolean()
  @IsOptional()
  isAnalyzed?: boolean;

  @IsString()
  @IsOptional()
  parseError?: string;

  @IsString()
  @IsOptional()
  analysisError?: string;
}
