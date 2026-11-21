import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { EResumeStatus } from '../enums/resume-status.enum';
import { EResumePriority } from '../enums/resume-priority.enum';
import { ParsedDataDto } from './parsed-data.dto';
import { AIAnalysisDto } from './ai-analysis.dto';

export class UpdateResumeDto {
  @IsNotEmpty({ message: 'Trạng thái không được để trống' })
  @Type(() => String)
  @IsEnum(EResumeStatus, {
    message: `Trạng thái phải là một trong các giá trị: ${Object.values(EResumeStatus).join(', ')}`,
  })
  @ApiProperty({ example: EResumeStatus.PENDING, description: 'Status of resume' })
  @IsString({ message: 'Trạng thái phải là chuỗi' })
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

  @IsEnum(EResumePriority)
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
