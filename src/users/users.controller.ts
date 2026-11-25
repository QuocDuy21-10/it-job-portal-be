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
import { BulkDeleteDto } from 'src/utils/dto/bulk-delete.dto';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { LockUserDto } from './dto/lock-user.dto';
import { ResponseMessage } from 'src/utils/decorators/response-message.decorator';
import { User } from 'src/utils/decorators/user.decorator';
import { KeywordListQueryDto } from 'src/utils/dto/keyword-list-query.dto';
import { PaginationQueryDto } from 'src/utils/dto/pagination-query.dto';
import { resolvePagination } from 'src/utils/helpers/list-query.helper';
import { IUser } from './user.interface';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { SaveJobDto } from './dto/save-job.dto';
import { FollowCompanyDto } from './dto/follow-company.dto';
import { Roles, ERole } from 'src/casl';

@ApiTags('User')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Create a new user',
    description:
      'API to create a new user with full information including: name, email, password, age, gender, address, company (optional) and role.',
  })
  @ApiBody({ type: CreateUserDto })
  @ResponseMessage('Tạo người dùng thành công')
  create(@Body() CreateUserDto: CreateUserDto, @User() user: IUser) {
    return this.usersService.create(CreateUserDto, user);
  }

  @Get()
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get a list of users (with pagination)',
    description:
      'API to get a list of all users with pagination and search. Supports filtering by fields.',
  })
  @ResponseMessage('Lấy danh sách người dùng thành công')
  findAll(@Query() listQuery: KeywordListQueryDto, @Query() query: string) {
    return this.usersService.findAll(listQuery.page, listQuery.limit, query, listQuery.keyword);
  }

  @Get('status-counts')
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Count users per role and locked users',
    description: 'Takes the list filters and keyword; ignores role and isLocked.',
  })
  @ResponseMessage('Lấy số lượng người dùng theo vai trò thành công')
  countByRole(@Query() listQuery: KeywordListQueryDto, @Query() query: string) {
    return this.usersService.countByRole(query, listQuery.keyword);
  }

  @Patch(':id')
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Update information of a user by ID',
    description: 'API to update information of a user by ID.',
  })
  @ApiBody({ type: UpdateUserDto })
  @ResponseMessage('Cập nhật người dùng thành công')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto, @User() user: IUser) {
    return this.usersService.update(id, updateUserDto, user);
  }

  @Post('save-job')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Save a job to user profile',
    description: "Add a job to the user's saved jobs list. Duplicates are automatically prevented.",
  })
  @ApiBody({ type: SaveJobDto })
  @ResponseMessage('Lưu tin tuyển dụng thành công')
  async saveJob(@Body() saveJobDto: SaveJobDto, @User() user: IUser) {
    await this.usersService.saveJob(user._id, saveJobDto.jobId);
    return { message: 'Lưu tin tuyển dụng thành công' };
  }

  @Delete('save-job')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Unsave a job from user profile',
    description: "Remove a job from the user's saved jobs list.",
  })
  @ApiBody({ type: SaveJobDto })
  @ResponseMessage('Bỏ lưu tin tuyển dụng thành công')
  async unsaveJob(@Body() saveJobDto: SaveJobDto, @User() user: IUser) {
    await this.usersService.unsaveJob(user._id, saveJobDto.jobId);
    return { message: 'Bỏ lưu tin tuyển dụng thành công' };
  }

  @Get('saved-jobs')
  @ApiOperation({
    summary: "Get user's saved jobs",
    description: 'Retrieve all jobs that the user has saved with pagination support.',
  })
  @ResponseMessage('Lấy danh sách tin tuyển dụng đã lưu thành công')
  async getSavedJobs(@User() user: IUser, @Query() pagination: PaginationQueryDto) {
    const { page, limit } = resolvePagination(pagination.page, pagination.limit);
    return this.usersService.getSavedJobs(user._id, page, limit);
  }

  @Post('follow-company')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Follow a company',
    description: "Add a company to the user's following list. Maximum 5 companies allowed.",
  })
  @ApiBody({ type: FollowCompanyDto })
  @ResponseMessage('Theo dõi công ty thành công')
  async followCompany(@Body() followCompanyDto: FollowCompanyDto, @User() user: IUser) {
    await this.usersService.followCompany(user._id, followCompanyDto.companyId);
    return { message: 'Theo dõi công ty thành công' };
  }

  @Delete('follow-company')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Unfollow a company',
    description: "Remove a company from the user's following list.",
  })
  @ApiBody({ type: FollowCompanyDto })
  @ResponseMessage('Bỏ theo dõi công ty thành công')
  async unfollowCompany(@Body() followCompanyDto: FollowCompanyDto, @User() user: IUser) {
    await this.usersService.unfollowCompany(user._id, followCompanyDto.companyId);
    return { message: 'Bỏ theo dõi công ty thành công' };
  }

  @Get('following-companies')
  @ApiOperation({
    summary: "Get user's following companies",
    description: 'Retrieve all companies that the user is following.',
  })
  @ResponseMessage('Lấy danh sách công ty đang theo dõi thành công')
  async getFollowingCompanies(@User() user: IUser) {
    return this.usersService.getFollowingCompanies(user._id);
  }

  @Get(':id')
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get information of a user by ID',
    description: 'API to get information of a user by ID.',
  })
  @ResponseMessage('Lấy thông tin người dùng thành công')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id/lock')
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Lock a user account',
    description:
      'Lock a user account that violates rules. All active sessions will be revoked immediately.',
  })
  @ApiBody({ type: LockUserDto })
  @ResponseMessage('Khoá tài khoản thành công')
  lockUser(@Param('id') id: string, @Body() lockUserDto: LockUserDto, @User() user: IUser) {
    return this.usersService.lockUser(id, lockUserDto, user);
  }

  @Patch(':id/unlock')
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Unlock a user account',
    description: 'Restore access to a previously locked user account.',
  })
  @ResponseMessage('Mở khoá tài khoản thành công')
  unlockUser(@Param('id') id: string, @User() user: IUser) {
    return this.usersService.unlockUser(id, user);
  }

  @Delete('bulk')
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Bulk delete users',
    description:
      'Soft deletes multiple users by IDs (max 100). The admin account and the requesting user cannot be deleted.',
  })
  @ResponseMessage('Xoá nhiều người dùng thành công')
  bulkRemove(@Body() bulkDeleteDto: BulkDeleteDto, @User() user: IUser) {
    return this.usersService.bulkRemove(bulkDeleteDto.ids, user);
  }

  @Delete(':id')
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Delete a user by ID',
    description: 'API to delete a user by ID.',
  })
  @ResponseMessage('Xoá người dùng thành công')
  remove(@Param('id') id: string, @User() user: IUser) {
    return this.usersService.remove(id, user);
  }
}
