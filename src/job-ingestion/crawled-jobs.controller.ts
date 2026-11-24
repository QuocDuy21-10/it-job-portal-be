import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ERole, Roles } from 'src/casl';
import { IUser } from 'src/users/user.interface';
import { ResponseMessage } from 'src/utils/decorators/response-message.decorator';
import { User } from 'src/utils/decorators/user.decorator';
import { CrawledJobsService } from './crawled-jobs.service';
import { BulkIdsDto } from './dto/bulk-ids.dto';
import { ListCrawledJobsQueryDto } from './dto/list-crawled-jobs-query.dto';
import { RemoveCrawledJobsDto } from './dto/remove-crawled-jobs.dto';

@ApiTags('Crawled Job')
@Controller('crawled-jobs')
@Roles(ERole.SUPER_ADMIN)
export class CrawledJobsController {
  constructor(private readonly crawledJobsService: CrawledJobsService) {}

  @Get()
  @ApiOperation({ summary: 'List crawled jobs, newest first' })
  @ResponseMessage('Lấy danh sách tin đã crawl thành công')
  findAll(@Query() query: ListCrawledJobsQueryDto) {
    return this.crawledJobsService.findAll(query);
  }

  @Post('remove')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Take jobs down; later syncs do not bring them back' })
  @ResponseMessage('Gỡ tin thành công')
  remove(@Body() dto: RemoveCrawledJobsDto, @User() user: IUser) {
    return this.crawledJobsService.remove(dto, user);
  }

  @Post('restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Undo a takedown; the crawl status decides if the job is public' })
  @ResponseMessage('Khôi phục tin thành công')
  restore(@Body() dto: BulkIdsDto) {
    return this.crawledJobsService.restore(dto.ids);
  }
}
