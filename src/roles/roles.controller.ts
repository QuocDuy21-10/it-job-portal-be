import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { ResponseMessage, User } from 'src/decorator/customize';
import { IUser } from 'src/users/users.interface';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Role')
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new role',
    description: 'Creates a new role with the provided information. Requires authentication.',
  })
  @ResponseMessage('Role created successfully')
  create(@Body() createRoleDto: CreateRoleDto, @User() user: IUser) {
    return this.rolesService.create(createRoleDto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'Get list roles',
    description: 'Retrieves a paginated list of all roles. Supports filtering and sorting.',
  })
  @ResponseMessage('Roles have been retrieved successfully')
  findAll(@Query('page') page: string, @Query('limit') limit: string, @Query() query: string) {
    return this.rolesService.findAll(+page, +limit, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get role by ID',
    description: 'Retrieves detailed information about a specific role by its ID',
  })
  @ResponseMessage('Role has been retrieved successfully')
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update role by ID',
    description:
      'Updates an existing role. Only the fields provided will be updated. Requires authentication.',
  })
  @ResponseMessage('Role updated successfully')
  update(@Param('id') id: string, @Body() updateRoleDto: UpdateRoleDto, @User() user: IUser) {
    return this.rolesService.update(id, updateRoleDto, user);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete role by ID',
    description:
      'Soft deletes a role. The role will be marked as deleted but not removed from database. Requires authentication.',
  })
  @ResponseMessage('Role deleted successfully')
  remove(@Param('id') id: string, @User() user: IUser) {
    return this.rolesService.remove(id, user);
  }
}
