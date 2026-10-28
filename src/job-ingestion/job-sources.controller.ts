import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ERole, Roles } from 'src/casl';
import { ResponseMessage } from 'src/utils/decorators/response-message.decorator';
import { ListCrawlRunsQueryDto } from './dto/list-crawl-runs-query.dto';
import { UpdateJobSourceDto } from './dto/update-job-source.dto';
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

  @Patch(':key')
  @ApiOperation({ summary: 'Enable/disable crawling or change the public display policy' })
  @ResponseMessage('Job source updated')
  update(@Param('key') key: string, @Body() dto: UpdateJobSourceDto) {
    return this.jobIngestionService.updateSource(key, dto);
  }

  @Get(':key/runs')
  @ApiOperation({ summary: 'List recent sync runs of one source, newest first' })
  @ResponseMessage('Get job source sync runs')
  findRuns(@Param('key') key: string, @Query() query: ListCrawlRunsQueryDto) {
    return this.jobIngestionService.findRuns(key, query);
  }

  @Post(':key/sync')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Queue a sync for one external job source' })
  @ResponseMessage('Job source sync queued')
  sync(@Param('key') key: string) {
    return this.jobIngestionService.requestSync(key);
  }
}
