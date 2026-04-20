import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { BulkDeleteDto } from 'src/utils/dto/bulk-delete.dto';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { IUser } from 'src/users/user.interface';
import { OptionalAuth } from 'src/utils/decorators/optional-auth.decorator';
import { ResponseMessage } from 'src/utils/decorators/response-message.decorator';
import { User } from 'src/utils/decorators/user.decorator';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles, ERole } from 'src/casl';
@ApiTags('Company')
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Create a new company',
    description:
      'API to create a new company with information including: name, address, description and logo. Requires admin or HR privileges.',
  })
  @ResponseMessage('Create a new company')
  create(@Body() createCompanyDto: CreateCompanyDto, @User() user: IUser) {
    return this.companiesService.create(createCompanyDto, user);
  }

  @Get('cleanup-orphaned-logos')
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Trigger orphaned logo cleanup manually',
    description:
      'Manually trigger cleanup of orphaned company logo files from disk. Deletes files older than 24h that are not referenced by any company. Requires admin privileges.',
  })
  @ResponseMessage('Orphaned logo cleanup completed')
  cleanupOrphanedLogos() {
    return this.companiesService.cleanupOrphanedLogos();
  }

  @OptionalAuth()
  @Get()
  @ApiOperation({
    summary: 'Get a list of companies with pagination (Public API)',
    description:
      'Public API to get a list of all companies with pagination and search. Does not require authentication.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
    example: '1',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of items per page (default: 10)',
    example: '10',
  })
  @ResponseMessage('Get list companies')
  findAll(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query() query: string,
    @User() user: IUser,
  ) {
    return this.companiesService.findAll(+page, +limit, query, user);
  }

  @OptionalAuth()
  @Get(':id')
  @ApiOperation({
    summary: 'Get detailed information of a company by ID (Public API)',
    description:
      'Public API to get detailed information of a company based on ID. Does not require authentication.',
  })
  @ResponseMessage('Get company by id')
  findOne(@Param('id') id: string, @User() user: IUser) {
    return this.companiesService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(ERole.SUPER_ADMIN, ERole.HR)
  @ApiOperation({
    summary: 'Update information of a company',
    description:
      'API to update information of a company based on ID. Can update one or more fields. Requires admin or HR privileges.',
  })
  @ApiBody({ type: UpdateCompanyDto })
  @ResponseMessage('Update company by id')
  update(@Param('id') id: string, @Body() updateCompanyDto: UpdateCompanyDto, @User() user: IUser) {
    return this.companiesService.update(id, updateCompanyDto, user);
  }

  @Delete('bulk')
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Bulk delete companies',
    description:
      'Soft deletes multiple companies by IDs (max 100). Also deactivates all active jobs associated with the deleted companies.',
  })
  @ResponseMessage('Bulk delete companies')
  bulkRemove(@Body() bulkDeleteDto: BulkDeleteDto, @User() user: IUser) {
    return this.companiesService.bulkRemove(bulkDeleteDto.ids, user);
  }

  @Delete(':id')
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Delete a company',
    description:
      'API to delete a company based on ID. Performs soft delete (sets isDeleted = true). Requires admin privileges.',
  })
  @ResponseMessage('Delete company by id')
  remove(@Param('id') id: string, @User() user: IUser) {
    return this.companiesService.remove(id, user);
  }
}
