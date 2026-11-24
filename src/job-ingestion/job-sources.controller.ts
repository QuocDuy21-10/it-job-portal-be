import {
  Body,
  Controller,
  Delete,
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
import { CreateJobSourceDto } from './dto/create-job-source.dto';
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
  @ResponseMessage('Lấy danh sách nguồn tin tuyển dụng thành công')
  findAll() {
    return this.jobIngestionService.findAllSources();
  }

  @Post()
  @ApiOperation({ summary: 'Add a Greenhouse or Lever board and queue its first sync' })
  @ResponseMessage('Thêm nguồn tin tuyển dụng thành công')
  create(@Body() dto: CreateJobSourceDto) {
    return this.jobIngestionService.createSource(dto);
  }

  @Delete(':key')
  @ApiOperation({ summary: 'Delete a disabled source and close its jobs' })
  @ResponseMessage('Xoá nguồn tin tuyển dụng thành công')
  remove(@Param('key') key: string) {
    return this.jobIngestionService.deleteSource(key);
  }

  @Patch(':key')
  @ApiOperation({ summary: 'Enable/disable crawling or change the public display policy' })
  @ResponseMessage('Cập nhật nguồn tin tuyển dụng thành công')
  update(@Param('key') key: string, @Body() dto: UpdateJobSourceDto) {
    return this.jobIngestionService.updateSource(key, dto);
  }

  @Get(':key/runs')
  @ApiOperation({ summary: 'List recent sync runs of one source, newest first' })
  @ResponseMessage('Lấy lịch sử đồng bộ nguồn tin tuyển dụng thành công')
  findRuns(@Param('key') key: string, @Query() query: ListCrawlRunsQueryDto) {
    return this.jobIngestionService.findRuns(key, query);
  }

  @Post(':key/sync')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Queue a sync for one external job source' })
  @ResponseMessage('Đã đưa đồng bộ nguồn tin tuyển dụng vào hàng đợi')
  sync(@Param('key') key: string) {
    return this.jobIngestionService.requestSync(key);
  }
}
