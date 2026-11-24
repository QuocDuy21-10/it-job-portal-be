import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ERole, Roles } from 'src/casl';
import { ResponseMessage } from 'src/utils/decorators/response-message.decorator';
import { CrawlFailureRepository } from './crawl-failure.repository';
import { BulkIdsDto } from './dto/bulk-ids.dto';
import { ListCrawlFailuresQueryDto } from './dto/list-crawl-failures-query.dto';

@ApiTags('Crawl Failure')
@Controller('crawl-failures')
@Roles(ERole.SUPER_ADMIN)
export class CrawlFailuresController {
  constructor(private readonly crawlFailures: CrawlFailureRepository) {}

  @Get()
  @ApiOperation({ summary: 'List jobs the crawler could not store, or filtered out' })
  @ResponseMessage('Lấy danh sách tin lỗi thành công')
  findAll(@Query() query: ListCrawlFailuresQueryDto) {
    return this.crawlFailures.findAll(query);
  }

  @Post('retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Make failed jobs eligible for the next sync; does not start one' })
  @ResponseMessage('Tin sẽ được thử lại ở lần đồng bộ kế tiếp')
  retry(@Body() dto: BulkIdsDto) {
    return this.crawlFailures.retry(dto.ids);
  }
}
