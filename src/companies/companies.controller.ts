import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { BulkDeleteDto } from 'src/utils/dto/bulk-delete.dto';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { IUser } from 'src/users/user.interface';
import { OptionalAuth } from 'src/utils/decorators/optional-auth.decorator';
import { ResponseMessage } from 'src/utils/decorators/response-message.decorator';
import { User } from 'src/utils/decorators/user.decorator';
import { KeywordListQueryDto } from 'src/utils/dto/keyword-list-query.dto';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles, ERole } from 'src/casl';
import { TopHiringCompaniesQueryDto, TopHiringCompanyDto } from './dto/top-hiring-company.dto';
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
  @ResponseMessage('Tạo công ty thành công')
  create(@Body() createCompanyDto: CreateCompanyDto, @User() user: IUser) {
    return this.companiesService.create(createCompanyDto, user);
  }

  @Post('cleanup-orphaned-logos')
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Trigger orphaned logo cleanup manually',
    description:
      'Manually trigger cleanup of orphaned company logo files from disk. Deletes files older than 24h that are not referenced by any company. Requires admin privileges.',
  })
  @ResponseMessage('Đã dọn các logo không còn sử dụng')
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
  @ResponseMessage('Lấy danh sách công ty thành công')
  findAll(@Query() listQuery: KeywordListQueryDto, @Query() query: string, @User() user: IUser) {
    return this.companiesService.findAll(
      listQuery.page,
      listQuery.limit,
      query,
      user,
      listQuery.keyword,
    );
  }

  @OptionalAuth()
  @Get('top-hiring')
  @ApiOperation({
    summary: 'Get top companies hiring for homepage (Public API)',
    description:
      'Retrieves companies ranked by approved active non-expired job count for homepage display.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of companies to return (default: 8, max: 12)',
    example: 8,
  })
  @ResponseMessage('Lấy danh sách công ty tuyển dụng nhiều nhất thành công')
  findTopHiringCompanies(
    @Query() query: TopHiringCompaniesQueryDto,
  ): Promise<TopHiringCompanyDto[]> {
    return this.companiesService.findTopHiringCompanies(query.limit);
  }

  @OptionalAuth()
  @Get(':id')
  @ApiOperation({
    summary: 'Get detailed information of a company by ID (Public API)',
    description:
      'Public API to get detailed information of a company based on ID. Does not require authentication.',
  })
  @ResponseMessage('Lấy thông tin công ty thành công')
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
  @ResponseMessage('Cập nhật công ty thành công')
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
  @ResponseMessage('Xoá nhiều công ty thành công')
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
  @ResponseMessage('Xoá công ty thành công')
  remove(@Param('id') id: string, @User() user: IUser) {
    return this.companiesService.remove(id, user);
  }
}
