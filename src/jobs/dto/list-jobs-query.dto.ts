import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { KeywordListQueryDto } from 'src/utils/dto/keyword-list-query.dto';
import { EJobListState } from '../enums/job-list-state.enum';

/** `keyword` matches job title, skills and company name. */
export class ListJobsQueryDto extends KeywordListQueryDto {
  @ApiPropertyOptional({
    enum: EJobListState,
    description: 'Lifecycle state. Only for SUPER ADMIN and HR with a company; ignored otherwise',
  })
  @IsOptional()
  @IsEnum(EJobListState)
  state?: EJobListState;
}
