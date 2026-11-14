import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { STRICT_THROTTLE } from 'src/config/throttle.constants';
import { Public } from 'src/utils/decorators/public.decorator';
import { ResponseMessage } from 'src/utils/decorators/response-message.decorator';
import { SearchJobsQueryDto } from './dto/search-jobs-query.dto';
import { JobSearchService } from './job-search.service';

@ApiTags('Job Search')
@Controller('job-search')
@Public()
// Public and uncached, so it keeps the strict per-IP limits instead of the global baseline.
@Throttle(STRICT_THROTTLE)
export class JobSearchController {
  constructor(private readonly jobSearchService: JobSearchService) {}

  @Get()
  @ApiOperation({ summary: 'Search internal and external jobs in one paginated list' })
  @ResponseMessage('Search jobs')
  search(@Query() query: SearchJobsQueryDto) {
    return this.jobSearchService.search(query);
  }

  @Get('external/:id')
  @ApiOperation({ summary: 'Get an external job by ID' })
  @ResponseMessage('Get external job by id')
  findExternalJob(@Param('id') id: string) {
    return this.jobSearchService.findExternalJob(id);
  }
}
