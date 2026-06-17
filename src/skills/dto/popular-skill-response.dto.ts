import { ApiProperty } from '@nestjs/swagger';

export class PopularSkillResponseDto {
  @ApiProperty({ example: 'React' })
  skill: string;

  @ApiProperty({ example: 42 })
  count: number;
}
