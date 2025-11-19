import { IsArray, IsEmail, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ParsedExperienceDto {
  @IsString()
  @IsOptional()
  company?: string;

  @IsString()
  @IsOptional()
  position?: string;

  @IsString()
  @IsOptional()
  duration?: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export class ParsedEducationDto {
  @IsString()
  @IsOptional()
  school?: string;

  @IsString()
  @IsOptional()
  degree?: string;

  @IsString()
  @IsOptional()
  major?: string;

  @IsString()
  @IsOptional()
  duration?: string;

  @IsString()
  @IsOptional()
  gpa?: string;
}

export class ParsedDataDto {
  @IsString()
  @IsOptional()
  fullName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  skills?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParsedExperienceDto)
  @IsOptional()
  experience?: ParsedExperienceDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParsedEducationDto)
  @IsOptional()
  education?: ParsedEducationDto[];

  @IsString()
  @IsOptional()
  summary?: string;

  @IsNumber()
  @IsOptional()
  yearsOfExperience?: number;
}
