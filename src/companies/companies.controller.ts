import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { IUser } from 'src/users/users.interface';
import { OptionalAuth, Public, ResponseMessage, User } from 'src/decorator/customize';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
@ApiTags('Company')
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new company',
    description:
      'API to create a new company with information including: name, address, description and logo. Requires admin or HR privileges.',
  })
  @ResponseMessage('Create a new company')
  create(@Body() createCompanyDto: CreateCompanyDto, @User() user: IUser) {
    return this.companiesService.create(createCompanyDto, user);
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

  @Delete(':id')
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
