import { IsNotEmpty, IsString } from 'class-validator';

export class CreatePermissionDto {
  @IsNotEmpty({ message: 'name is required' })
  @IsString({ message: 'name must be a string' })
  name: string;

  @IsNotEmpty({ message: 'apiPath is required' })
  @IsString({ message: 'apiPath must be a string' })
  apiPath: string;

  @IsNotEmpty({ message: 'method is required' })
  @IsString({ message: 'method must be a string' })
  method: string;

  @IsNotEmpty({ message: 'module is required' })
  @IsString({ message: 'module must be a string' })
  module: string;
}
