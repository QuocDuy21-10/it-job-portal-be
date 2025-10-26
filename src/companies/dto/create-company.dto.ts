import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCompanyDto {
  @IsNotEmpty({ message: 'Name is required' })
  @IsString({ message: 'Name must be a string' })
  @MaxLength(100, { message: 'Name is too long (max: 100 chars)' })
  @Transform(({ value }) => value?.trim())
  @ApiProperty({ example: 'Google', description: 'Name of company' })
  name: string;

  @IsNotEmpty({ message: 'Address is required' })
  @IsString({ message: 'Address must be a string' })
  @MaxLength(200, { message: 'Address is too long (max: 200 chars)' })
  @Transform(({ value }) => value?.trim())
  @ApiProperty({ example: 'Ha Noi', description: 'Address of company' })
  address: string;

  @IsNotEmpty({ message: 'Description is required' })
  @IsString({ message: 'Description must be a string' })
  @MaxLength(1000, { message: 'Description is too long (max: 1000 chars)' })
  @Transform(({ value }) => value?.trim())
  @ApiProperty({ example: 'Google ...', description: 'Description of company' })
  description: string;

  @IsNotEmpty({ message: 'Logo is required' })
  @IsString({ message: 'Logo must be a string' })
  @IsOptional()
  @Transform(({ value }) => value?.trim())
  @ApiProperty({ example: 'logo.png', description: 'Logo of company' })
  logo?: string;
}
