import { IsArray, IsBoolean, IsDate, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SkillMatchDto {
  @IsString()
  skill: string;

  @IsBoolean()
  matched: boolean;

  @IsString()
  @IsOptional()
  proficiencyLevel?: string;
}

export class AIAnalysisDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  matchingScore?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SkillMatchDto)
  @IsOptional()
  skillsMatch?: SkillMatchDto[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  strengths?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  weaknesses?: string[];

  @IsString()
  @IsOptional()
  summary?: string;

  @IsString()
  @IsOptional()
  recommendation?: string;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  analyzedAt?: Date;
}
