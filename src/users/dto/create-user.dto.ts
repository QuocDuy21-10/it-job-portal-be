import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @IsNotEmpty({ message: 'Tên là bắt buộc' })
  @IsString({ message: 'Tên phải là chuỗi' })
  @MaxLength(100, { message: 'Tên quá dài (tối đa 100 ký tự)' })
  @ApiProperty({ example: 'Test', description: 'Name of user' })
  name: string;

  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsNotEmpty({ message: 'Email là bắt buộc' })
  @ApiProperty({ example: 'test@gmail.com', description: 'Email of user' })
  email: string;

  @IsNotEmpty({ message: 'Mật khẩu là bắt buộc' })
  @ApiProperty({ example: '123456', description: 'Password of user' })
  password: string;

  @IsOptional()
  @IsString({ message: 'Ảnh đại diện phải là chuỗi' })
  @MaxLength(500, { message: 'URL ảnh đại diện quá dài (tối đa 500 ký tự)' })
  @ApiPropertyOptional({
    example: 'https://example.com/avatar.jpg',
    description: 'Avatar URL of user',
  })
  avatar?: string;

  @IsOptional()
  @IsNotEmptyObject({ nullable: true }, { message: 'Công ty là bắt buộc' })
  @IsObject({ message: 'Công ty phải là object' })
  @ValidateNested()
  @Type(() => CompanyDto)
  @ApiProperty({ type: CompanyDto, description: 'Company of user' })
  company?: CompanyDto;

  @IsNotEmpty({ message: 'Vai trò là bắt buộc' })
  @IsEnum(ERole, { message: 'Vai trò phải là một trong các giá trị: SUPER ADMIN, HR, NORMAL USER' })
  @ApiProperty({ enum: ERole, example: ERole.HR, description: 'Role of user' })
  role: ERole;
}
