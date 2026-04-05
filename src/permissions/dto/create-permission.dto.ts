import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { EPermissionMethod } from '../enums/permission-method.enum';
import { EPermissionModule } from '../enums/permission-module.enum';

export class CreatePermissionDto {
  @IsNotEmpty({ message: 'name is required' })
  @IsString({ message: 'name must be a string' })
  @MaxLength(255, { message: 'name is too long (max: 255 chars)' })
  @Transform(({ value }) => value?.trim())
  @ApiProperty({ example: 'Create name permission', description: 'Name of permission' })
  name: string;

  @IsNotEmpty({ message: 'apiPath is required' })
  @IsString({ message: 'apiPath must be a string' })
  @ApiProperty({ example: '/api/v1/users', description: 'API path of permission' })
  apiPath: string;

  @IsNotEmpty({ message: 'method is required' })
  @IsString({ message: 'method must be a string' })
  @IsEnum(EPermissionMethod, {
    message: `method must be one of the following values: ${Object.values(EPermissionMethod).join(', ')}`,
  })
  @ApiProperty({ example: EPermissionMethod.GET, description: 'HTTP method of permission' })
  method: string;

  @IsNotEmpty({ message: 'module is required' })
  @IsString({ message: 'module must be a string' })
  @IsEnum(EPermissionModule, {
    message: `module must be one of the following values: ${Object.values(EPermissionModule).join(', ')}`,
  })
  @ApiProperty({ example: EPermissionModule.USER, description: 'Module of permission' })
  module: string;
}
