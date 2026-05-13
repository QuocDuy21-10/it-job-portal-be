import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { EChatSessionType } from '../enums/chat-session-type.enum';

export class CreateChatSessionDto {
  @ApiProperty({
    description: 'Chat session type',
    enum: EChatSessionType,
    default: EChatSessionType.GENERAL,
    required: false,
  })
  @IsOptional()
  @IsEnum(EChatSessionType)
  type?: EChatSessionType;

  @ApiProperty({
    description: 'Optional session title',
    example: 'Backend career advice',
    maxLength: 120,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;
}
