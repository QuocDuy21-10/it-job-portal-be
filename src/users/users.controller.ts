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
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Public, ResponseMessage, User } from 'src/decorator/customize';
import { IUser } from './users.interface';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';

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

  @Get(':id')
  @ApiOperation({
    summary: 'Get information of a user by ID',
    description: 'API to get information of a user by ID.',
  })
  @ResponseMessage('Get user by id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
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
