import {
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CertificateDto {
  @ApiProperty({
    description: 'Unique identifier for the certificate',
    example: 'cert-1',
  })
  @IsString()
  id: string;

  @ApiProperty({
    description: 'Certificate name',
    example: 'AWS Certified Developer - Associate',
    maxLength: 200,
  })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiProperty({
    description: 'Issuing organization',
    example: 'Amazon Web Services',
    maxLength: 200,
  })
  @IsString()
  @MaxLength(200)
  issuer: string;

  @ApiProperty({
    description: 'Issue date (string format)',
    example: '2022-06-15',
  })
  @IsString()
  date: string;
}
