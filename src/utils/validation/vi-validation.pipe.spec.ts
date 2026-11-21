import { ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { translateValidationMessage, ViValidationPipe } from './vi-validation.pipe';

describe('translateValidationMessage', () => {
  it.each([
    ['name must be a string', 'name phải là chuỗi'],
    ['name should not be empty', 'name không được để trống'],
    ['name must be shorter than or equal to 100 characters', 'name không được dài quá 100 ký tự'],
    ['password must be longer than or equal to 8 characters', 'password phải có ít nhất 8 ký tự'],
    ['skills must be an array', 'skills phải là mảng'],
    ['salary must not be less than 0', 'salary không được nhỏ hơn 0'],
    ['limit must not be greater than 100', 'limit không được lớn hơn 100'],
    [
      'level must be one of the following values: INTERN, FRESHER',
      'level phải là một trong các giá trị: INTERN, FRESHER',
    ],
    ['jobId must be a mongodb id', 'jobId phải là ID hợp lệ'],
    ['page must be an integer number', 'page phải là số nguyên'],
    ['email must be an email', 'email phải là email hợp lệ'],
    ['isActive must be a boolean value', 'isActive phải là giá trị true hoặc false'],
    ['phone must match /^\\d+$/ regular expression', 'phone không đúng định dạng'],
    ['salary must be a number conforming to the specified constraints', 'salary phải là số'],
    ['company must be an object', 'company phải là object'],
    ['company must be a non-empty object', 'company phải là object và không được rỗng'],
    ['startDate must be a Date instance', 'startDate phải là ngày hợp lệ'],
    ['from must be a valid ISO 8601 date string', 'from phải là ngày theo định dạng ISO 8601'],
    ['skills must contain at least 1 elements', 'skills phải có ít nhất 1 phần tử'],
    ['skills must contain no more than 20 elements', 'skills không được có quá 20 phần tử'],
    ['clientId must be a UUID', 'clientId phải là UUID'],
    ['quantity must be a positive number', 'quantity phải là số dương'],
    ['acceptTerms must be equal to true', 'acceptTerms phải bằng true'],
    ['each value in skills must be a string', 'Mỗi giá trị trong skills phải là chuỗi'],
    ['experiences.0.title must be a string', 'experiences.0.title phải là chuỗi'],
    ['nested property company must be either object or array', 'company phải là object hoặc mảng'],
    ['property role should not exist', 'Không được gửi trường role'],
  ])('%s', (input, expected) => {
    expect(translateValidationMessage(input)).toBe(expected);
  });

  it('keeps custom messages and unknown defaults unchanged', () => {
    expect(translateValidationMessage('Tên là bắt buộc')).toBe('Tên là bắt buộc');
    expect(translateValidationMessage('ip must be an ip address')).toBe('ip must be an ip address');
  });
});

class AddressDto {
  @IsString()
  city: string;
}

class SampleDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(5)
  name: string;

  @IsEmail()
  email: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsEnum({ A: 'A', B: 'B' })
  level: string;

  @IsMongoId()
  jobId: string;

  @IsArray()
  @ArrayMaxSize(1)
  @IsString({ each: true })
  tags: string[];

  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;
}

describe('ViValidationPipe', () => {
  it('returns Vietnamese messages in the usual Bad Request shape', async () => {
    const pipe = new ViValidationPipe({ whitelist: true });
    const metadata: ArgumentMetadata = { type: 'body', metatype: SampleDto };

    const error = await pipe
      .transform(
        {
          name: 'too long',
          email: 'x',
          quantity: 0,
          level: 'C',
          jobId: '1',
          tags: [1, 2],
          address: { city: 1 },
        },
        metadata,
      )
      .catch(e => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: expect.arrayContaining([
        'name không được dài quá 5 ký tự',
        'email phải là email hợp lệ',
        'quantity không được nhỏ hơn 1',
        'level phải là một trong các giá trị: A, B',
        'jobId phải là ID hợp lệ',
        'tags không được có quá 1 phần tử',
        'Mỗi giá trị trong tags phải là chuỗi',
        'address.city phải là chuỗi',
      ]),
    });
    expect(error.getResponse().message.join('\n')).not.toMatch(/ must | should /);
  });
});
