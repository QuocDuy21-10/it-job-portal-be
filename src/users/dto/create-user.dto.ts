import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNotEmptyObject,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ERole } from 'src/casl/enums/role.enum';
import { CompanyDto } from 'src/companies/dto/company.dto';

export class CreateUserDto {
  @IsNotEmpty({ message: 'Name is required' })
  @IsString({ message: 'Name must be a string' })
  @MaxLength(100, { message: 'Name is too long (max: 100 chars)' })
  @ApiProperty({ example: 'Test', description: 'Name of user' })
  name: string;

  @IsEmail({}, { message: 'Email is invalid' })
  @IsNotEmpty({ message: 'Email is required' })
  @ApiProperty({ example: 'test@gmail.com', description: 'Email of user' })
  email: string;

  @IsNotEmpty({ message: 'Password is required' })
  @ApiProperty({ example: '123456', description: 'Password of user' })
  password: string;

  @IsOptional()
  @IsNotEmptyObject({ nullable: true }, { message: 'Company is required' })
  @IsObject({ message: 'Company must be an object' })
  @ValidateNested()
  @Type(() => CompanyDto)
  @ApiProperty({ type: CompanyDto, description: 'Company of user' })
  company?: CompanyDto;

  @IsNotEmpty({ message: 'Role is required' })
  @IsEnum(ERole, { message: 'Role must be one of: SUPER ADMIN, HR, NORMAL USER' })
  @ApiProperty({ enum: ERole, example: ERole.HR, description: 'Role of user' })
  role: ERole;
}
