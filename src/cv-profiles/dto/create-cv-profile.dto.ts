import {
  IsOptional,
  IsArray,
  ValidateNested,
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

export class CreateCvProfileDto {
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
    example: [
      {
        id: 'edu-1',
        school: 'Đại học Bách Khoa TPHCM',
        degree: 'Bachelor',
        field: 'Computer Science',
        startDate: '2013-09-01',
        endDate: '2017-06-30',
        description: 'GPA: 3.8/4.0',
      },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EducationDto)
  education?: EducationDto[];

  @ApiPropertyOptional({
    description: 'Work experience',
    type: [ExperienceDto],
    example: [
      {
        id: 'exp-1',
        company: 'Tech Corp',
        position: 'Senior Backend Developer',
        startDate: '2020-01-01',
        endDate: '2023-12-31',
        description: 'Developed microservices',
      },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExperienceDto)
  experience?: ExperienceDto[];

  @ApiPropertyOptional({
    description: 'Technical and soft skills',
    type: [SkillDto],
    example: [
      { id: 'skill-1', name: 'NestJS', level: 'Advanced' },
      { id: 'skill-2', name: 'MongoDB', level: 'Intermediate' },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SkillDto)
  skills?: SkillDto[];

  @ApiPropertyOptional({
    description: 'Language proficiencies',
    type: [LanguageDto],
    example: [
      { id: 'lang-1', name: 'Vietnamese', proficiency: 'Native' },
      { id: 'lang-2', name: 'English', proficiency: 'Fluent' },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LanguageDto)
  languages?: LanguageDto[];

  @ApiPropertyOptional({
    description: 'Projects portfolio',
    type: [ProjectDto],
    example: [
      {
        id: 'proj-1',
        name: 'E-commerce Platform',
        description: 'Full-stack solution',
        link: 'https://github.com/user/project',
      },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectDto)
  projects?: ProjectDto[];

  @ApiPropertyOptional({
    description: 'Certifications',
    type: [CertificateDto],
    example: [
      {
        id: 'cert-1',
        name: 'AWS Certified Developer',
        issuer: 'Amazon Web Services',
        date: '2022-06-15',
      },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CertificateDto)
  certificates?: CertificateDto[];

  @ApiPropertyOptional({
    description: 'Awards and achievements',
    type: [AwardDto],
    example: [
      {
        id: 'award-1',
        name: 'Best Developer 2023',
        date: '2023-12-01',
        description: 'Outstanding performance',
      },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AwardDto)
  awards?: AwardDto[];
}
