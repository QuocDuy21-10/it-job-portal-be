import {
  IsString,
  IsEmail,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PersonalInfoDto {
  @ApiProperty({
    description: 'Full name of the person',
    example: 'Nguyễn Văn A',
    maxLength: 100,
  })
  @IsString()
  @MaxLength(100)
  fullName: string;

  @ApiProperty({
    description: 'Phone number',
    example: '0123456789',
    maxLength: 20,
  })
  @IsString()
  @MaxLength(20)
  phone: string;

  @ApiProperty({
    description: 'Email address',
    example: 'nguyenvana@example.com',
  })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    description: 'Date of birth (string format)',
    example: '1995-05-15',
  })
  @IsOptional()
  @IsString()
  birthday?: string;

  @ApiPropertyOptional({
    description: 'Gender',
    example: 'Nam',
    maxLength: 20,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  gender?: string;

  @ApiPropertyOptional({
    description: 'Full address',
    example: '123 Đường ABC, Quận 1, TPHCM',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @ApiPropertyOptional({
    description: 'Personal website, LinkedIn, or portfolio link',
    example: 'https://linkedin.com/in/nguyenvana',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  personalLink?: string;

  @ApiPropertyOptional({
    description: 'Short biography or summary',
    example: 'Experienced Full Stack Developer with 5+ years of experience in web development',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string;
}
