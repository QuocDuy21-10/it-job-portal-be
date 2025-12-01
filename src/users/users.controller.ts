import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Public, ResponseMessage, SkipCheckPermission, User } from 'src/decorator/customize';
import { IUser } from './users.interface';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { SaveJobDto } from './dto/save-job.dto';
import { FollowCompanyDto } from './dto/follow-company.dto';

@ApiTags('User')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new user',
    description:
      'API to create a new user with full information including: name, email, password, age, gender, address, company (optional) and role.',
  })
  @ApiBody({ type: CreateUserDto })
  @ResponseMessage('Create a new user')
  create(@Body() CreateUserDto: CreateUserDto, @User() user: IUser) {
    return this.usersService.create(CreateUserDto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'Get a list of users (with pagination)',
    description:
      'API to get a list of all users with pagination and search. Supports filtering by fields.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: String,
    description: 'Page number (default: 1)',
    example: '1',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: String,
    description: 'Number of items per page (default: 10)',
    example: '10',
  })
  @ResponseMessage('Get list users')
  findAll(@Query('page') page: string, @Query('limit') limit: string, @Query() query: string) {
    return this.usersService.findAll(+page, +limit, query);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update information of a user by ID',
    description: 'API to update information of a user by ID.',
  })
  @ApiBody({ type: UpdateUserDto })
  @ResponseMessage('Update user by id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto, @User() user: IUser) {
    return this.usersService.update(id, updateUserDto, user);
  }

  // ==================== SAVED JOBS ENDPOINTS ====================

  @SkipCheckPermission()
  @Post('save-job')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Save a job to user profile',
    description: 'Add a job to the user\'s saved jobs list. Duplicates are automatically prevented.',
  })
  @ApiBody({ type: SaveJobDto })
  @ResponseMessage('Job saved successfully')
  async saveJob(@Body() saveJobDto: SaveJobDto, @User() user: IUser) {
    await this.usersService.saveJob(user._id, saveJobDto.jobId);
    return { message: 'Job saved successfully' };
  }

  @SkipCheckPermission()
  @Delete('save-job')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Unsave a job from user profile',
    description: 'Remove a job from the user\'s saved jobs list.',
  })
  @ApiBody({ type: SaveJobDto })
  @ResponseMessage('Job unsaved successfully')
  async unsaveJob(@Body() saveJobDto: SaveJobDto, @User() user: IUser) {
    await this.usersService.unsaveJob(user._id, saveJobDto.jobId);
    return { message: 'Job unsaved successfully' };
  }

  @SkipCheckPermission()
  @Get('saved-jobs')
  @ApiOperation({
    summary: 'Get user\'s saved jobs',
    description: 'Retrieve all jobs that the user has saved with pagination support.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of items per page (default: 10)',
    example: 10,
  })
  @ResponseMessage('Get saved jobs successfully')
  async getSavedJobs(
    @User() user: IUser,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    return this.usersService.getSavedJobs(user._id, +page, +limit);
  }

  // ==================== FOLLOW COMPANY ENDPOINTS ====================
  @SkipCheckPermission()
  @Post('follow-company')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Follow a company',
    description: 'Add a company to the user\'s following list. Maximum 5 companies allowed.',
  })
  @ApiBody({ type: FollowCompanyDto })
  @ResponseMessage('Company followed successfully')
  async followCompany(@Body() followCompanyDto: FollowCompanyDto, @User() user: IUser) {
    await this.usersService.followCompany(user._id, followCompanyDto.companyId);
    return { message: 'Company followed successfully' };
  }

  @SkipCheckPermission()
  @Delete('follow-company')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Unfollow a company',
    description: 'Remove a company from the user\'s following list.',
  })
  @ApiBody({ type: FollowCompanyDto })
  @ResponseMessage('Company unfollowed successfully')
  async unfollowCompany(@Body() followCompanyDto: FollowCompanyDto, @User() user: IUser) {
    await this.usersService.unfollowCompany(user._id, followCompanyDto.companyId);
    return { message: 'Company unfollowed successfully' };
  }

  @SkipCheckPermission()
  @Get('following-companies')
  @ApiOperation({
    summary: 'Get user\'s following companies',
    description: 'Retrieve all companies that the user is following.',
  })
  @ResponseMessage('Get following companies successfully')
  async getFollowingCompanies(@User() user: IUser) {
    return this.usersService.getFollowingCompanies(user._id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get information of a user by ID',
    description: 'API to get information of a user by ID.',
  })
  @ResponseMessage('Get user by id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a user by ID',
    description: 'API to delete a user by ID.',
  })
  @ResponseMessage('Delete user by id')
  remove(@Param('id') id: string, @User() user: IUser) {
    return this.usersService.remove(id, user);
  }
}
