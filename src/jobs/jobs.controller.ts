import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { BulkDeleteDto } from 'src/utils/dto/bulk-delete.dto';
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { ApproveJobDto } from './dto/approve-job.dto';
import { OptionalAuth } from 'src/utils/decorators/optional-auth.decorator';
import { ResponseMessage } from 'src/utils/decorators/response-message.decorator';
import { User } from 'src/utils/decorators/user.decorator';
import { IUser } from 'src/users/user.interface';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/casl';
import { ERole } from 'src/casl';
@ApiTags('Job')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  @Roles(ERole.SUPER_ADMIN, ERole.HR)
  @ApiOperation({
    summary: 'Create a new job posting',
    description:
      'Creates a new job posting with the provided information. Requires authentication.',
  })
  @ResponseMessage('Create a new job')
  create(@Body() createJobDto: CreateJobDto, @User() user: IUser) {
    return this.jobsService.create(createJobDto, user);
  }

  @OptionalAuth()
  @Get()
  @ApiOperation({
    summary: 'Get list job postings with pagination (Public API)',
    description:
      'Retrieves a paginated list of all active job postings. Supports filtering and sorting.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (starts from 1)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of items per page',
    example: 10,
  })
  @ResponseMessage('Get list jobs')
  findAll(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query() query: string,
    @User() user: IUser,
  ) {
    return this.jobsService.findAll(+page, +limit, query, user);
  }

  @OptionalAuth()
  @Get(':id')
  @ApiOperation({
    summary: 'Get job by ID (Public API)',
    description: 'Retrieves detailed information about a specific job posting by its ID',
  })
  @ResponseMessage('Get job by id')
  findOne(@Param('id') id: string, @User() user: IUser) {
    return this.jobsService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(ERole.SUPER_ADMIN, ERole.HR)
  @ApiOperation({
    summary: 'Update job by ID',
    description:
      'Updates an existing job posting. Only the fields provided will be updated. Requires authentication.',
  })
  @ResponseMessage('Update job by id')
  update(@Param('id') id: string, @Body() updateJobDto: UpdateJobDto, @User() user: IUser) {
    return this.jobsService.update(id, updateJobDto, user);
  }

  @Delete('bulk')
  @Roles(ERole.SUPER_ADMIN, ERole.HR)
  @ApiOperation({
    summary: 'Bulk delete jobs',
    description:
      'Soft deletes multiple job postings by IDs (max 100). HR can only delete jobs belonging to their own company.',
  })
  @ResponseMessage('Bulk delete jobs')
  bulkRemove(@Body() bulkDeleteDto: BulkDeleteDto, @User() user: IUser) {
    return this.jobsService.bulkRemove(bulkDeleteDto.ids, user);
  }

  @Delete(':id')
  @Roles(ERole.SUPER_ADMIN, ERole.HR)
  @ApiOperation({
    summary: 'Delete job by ID',
    description:
      'Soft deletes a job posting. The job will be marked as deleted but not removed from database. Requires authentication.',
  })
  @ResponseMessage('Delete job by id')
  remove(@Param('id') id: string, @User() user: IUser) {
    return this.jobsService.remove(id, user);
  }

  @Patch(':id/approve')
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Approve or reject a job posting (Admin only)',
    description:
      'Allows SUPER ADMIN to approve or reject a job posting. Approved jobs become visible to the public.',
  })
  @ResponseMessage('Job approval status updated')
  approveJob(@Param('id') id: string, @Body() approveJobDto: ApproveJobDto, @User() user: IUser) {
    return this.jobsService.approveJob(id, approveJobDto, user);
  }
}
