import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsMongoId, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import mongoose from 'mongoose';

export class CreateRoleDto {
  @IsNotEmpty({ message: 'name is required' })
  @IsString({ message: 'name must be a string' })
  @MaxLength(255, { message: 'name is too long (max: 255 chars)' })
  @Transform(({ value }) => value.trim())
  @ApiProperty({ example: 'HR', description: 'Name of role' })
  name: string;

  @IsNotEmpty({ message: 'description is required' })
  @IsString({ message: 'description must be a string' })
  @MaxLength(1000, { message: 'description is too long (max: 2000 chars)' })
  @Transform(({ value }) => value.trim())
  @ApiProperty({ example: 'Role for HR department', description: 'Description of role' })
  description: string;

  @IsNotEmpty({ message: 'isActive is required' })
  @IsBoolean({ message: 'isActive must be a boolean' })
  @ApiProperty({
    example: true,
    description: 'Indicates whether the role is active',
    default: true,
  })
  isActive: boolean;

  @IsNotEmpty({ message: 'permissions are required' })
  @IsMongoId({ each: true, message: 'each permission must be a valid Mongo ID' })
  @IsArray({ message: 'permissions must be an array' })
  @ApiProperty({
    example: ['64a7f0c2e1b8c8b5d6f0a1b2'],
    description: 'Array of permission IDs associated with the role',
  })
  permissions: mongoose.Schema.Types.ObjectId[];
}
