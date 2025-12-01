import {
  IsOptional,
  IsArray,
  ValidateNested,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PersonalInfoDto } from './basic-info.dto';
import { SkillDto } from './skill.dto';
import { ExperienceDto } from './experience.dto';
import { EducationDto } from './education.dto';
import { ProjectDto } from './project.dto';
import { CertificateDto } from './certificate.dto';
import { LanguageDto } from './language.dto';
import { AwardDto } from './award.dto';

/**
 * DTO for upsert CV Profile with optional avatar file upload
 * Avatar is handled separately as multipart file, stored as URL in PersonalInfo
 */
export class UpsertCvProfileDto {
  @ApiProperty({
    description: 'Personal information (required)',
    type: PersonalInfoDto,
  })
  @ValidateNested()
  @Type(() => PersonalInfoDto)
  personalInfo: PersonalInfoDto;

  @ApiPropertyOptional({
    description: 'Education history',
    type: [EducationDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EducationDto)
  education?: EducationDto[];

  @ApiPropertyOptional({
    description: 'Work experience',
    type: [ExperienceDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExperienceDto)
  experience?: ExperienceDto[];

  @ApiPropertyOptional({
    description: 'Technical and soft skills',
    type: [SkillDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SkillDto)
  skills?: SkillDto[];

  @ApiPropertyOptional({
    description: 'Language proficiencies',
    type: [LanguageDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LanguageDto)
  languages?: LanguageDto[];

  @ApiPropertyOptional({
    description: 'Projects portfolio',
    type: [ProjectDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectDto)
  projects?: ProjectDto[];

  @ApiPropertyOptional({
    description: 'Certifications',
    type: [CertificateDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CertificateDto)
  certificates?: CertificateDto[];

  @ApiPropertyOptional({
    description: 'Awards and achievements',
    type: [AwardDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AwardDto)
  awards?: AwardDto[];
}
