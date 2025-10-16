import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Public, ResponseMessage, User } from 'src/decorator/customize';
import { IUser } from './users.interface';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('User APIs')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ResponseMessage('Create a new user')
  create(@Body() CreateUserDto: CreateUserDto, @User() user: IUser) {
    return this.usersService.create(CreateUserDto, user);
  }

  @Get()
  @ResponseMessage('Get list users')
  findAll(@Query('page') page: string, @Query('limit') limit: string, @Query() query: string) {
    return this.usersService.findAll(+page, +limit, query);
  }

  @Public()
  @Get(':id')
  @ResponseMessage('Get user by id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ResponseMessage('Update user by id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto, @User() user: IUser) {
    return this.usersService.update(id, updateUserDto, user);
  }

  @Delete(':id')
  @ResponseMessage('Delete user by id')
  remove(@Param('id') id: string, @User() user: IUser) {
    return this.usersService.remove(id, user);
  }
}
