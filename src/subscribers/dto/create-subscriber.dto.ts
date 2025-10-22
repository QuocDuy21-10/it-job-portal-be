import { IsArray, IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class CreateSubscriberDto {
  @IsNotEmpty({ message: 'Name is required' })
  name: string;

  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Email is invalid' })
  email: string;

  @IsNotEmpty({ message: 'Skills is required' })
  @IsArray({ message: 'Skills must be an array' })
  @IsString({ each: true, message: 'Each skill must be a string' })
  skills: string[];
}
