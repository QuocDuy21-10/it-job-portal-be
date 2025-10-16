import { IsArray, IsMongoId, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import mongoose from 'mongoose';

export class CreateRoleDto {
  @IsNotEmpty({ message: 'name is required' })
  @IsString({ message: 'name must be a string' })
  name: string;

  @IsNotEmpty({ message: 'description is required' })
  @IsString({ message: 'description must be a string' })
  @MaxLength(1000, { message: 'description is too long (max: 2000 chars)' })
  description: string;

  @IsNotEmpty({ message: 'isActive is required' })
  isActive: boolean;

  @IsNotEmpty({ message: 'permissions are required' })
  @IsMongoId({ each: true, message: 'each permission must be a valid Mongo ID' })
  @IsArray({ message: 'permissions must be an array' })
  permissions: mongoose.Schema.Types.ObjectId[];
}
