import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ERole, Roles } from 'src/casl';
import { ResponseMessage } from 'src/utils/decorators/response-message.decorator';
import { JobIngestionService } from './job-ingestion.service';

@ApiTags('Job Source')
@Controller('job-sources')
@Roles(ERole.SUPER_ADMIN)
export class JobSourcesController {
  constructor(private readonly jobIngestionService: JobIngestionService) {}

  @Get()
  @ApiOperation({ summary: 'List external job sources with their last sync status' })
  @ResponseMessage('Get list job sources')
  findAll() {
    return this.jobIngestionService.findAllSources();
  }

  @Post(':key/sync')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Queue a sync for one external job source' })
  @ResponseMessage('Job source sync queued')
  sync(@Param('key') key: string) {
    return this.jobIngestionService.requestSync(key);
  }
}
