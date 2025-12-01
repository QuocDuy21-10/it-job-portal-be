import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength, MinLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({
    description: 'User message to AI career advisor',
    example: 'Tôi nên học skill gì để trở thành Senior Backend Engineer?',
    minLength: 1,
    maxLength: 1000
  })
  @IsString()
  @IsNotEmpty({ message: 'Message cannot be empty' })
  @MinLength(1, { message: 'Message must be at least 1 character' })
  @MaxLength(1000, { message: 'Message cannot exceed 1000 characters' })
  message: string;
}
