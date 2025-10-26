import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { ResponseMessage, User } from 'src/decorator/customize';
import { IUser } from 'src/users/users.interface';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Permission')
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new permission',
    description: 'Create a new permission with the provided information. Requires authentication.',
  })
  @ResponseMessage('Permission has been created successfully')
  create(@Body() createPermissionDto: CreatePermissionDto, @User() user: IUser) {
    return this.permissionsService.create(createPermissionDto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'Get a list of permissions (with pagination)',
    description: 'Retrieve a list of all permissions with pagination and filtering.',
  })
  @ResponseMessage('Permissions have been retrieved successfully')
  findAll(@Query('page') page: string, @Query('limit') limit: string, @Query() query: string) {
    return this.permissionsService.findAll(+page, +limit, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get detailed information of a permission by ID',
    description: 'Retrieve detailed information of a permission based on ID.',
  })
  @ResponseMessage('Permission has been found successfully')
  findOne(@Param('id') id: string) {
    return this.permissionsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a permission by ID',
    description:
      'Update an existing permission. Only the provided fields will be updated. Requires authentication.',
  })
  @ResponseMessage('Permission has been updated successfully')
  update(
    @Param('id') id: string,
    @Body() updatePermissionDto: UpdatePermissionDto,
    @User() user: IUser,
  ) {
    return this.permissionsService.update(id, updatePermissionDto, user);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a permission',
    description:
      'Delete a permission based on ID. Performs soft delete (sets isDeleted = true). Requires authentication.',
  })
  @ResponseMessage('Permission has been deleted successfully')
  remove(@Param('id') id: string, @User() user: IUser) {
    return this.permissionsService.remove(id, user);
  }
}
