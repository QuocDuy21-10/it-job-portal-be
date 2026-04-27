import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles, ERole } from 'src/casl';
import { IUser } from 'src/users/user.interface';
import { Public } from 'src/utils/decorators/public.decorator';
import { ResponseMessage } from 'src/utils/decorators/response-message.decorator';
import { User } from 'src/utils/decorators/user.decorator';
import { BulkDeleteDto } from 'src/utils/dto/bulk-delete.dto';
import { CreateSkillDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { SkillsService } from './skills.service';

@ApiTags('Skill')
@Controller('skills')
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Public()
  @Get('catalog')
  @ApiOperation({
    summary: 'Get active skills catalog',
    description: 'Returns active skills for dropdowns, autocomplete, and canonical lookup.',
  })
  @ApiQuery({ name: 'search', required: false, type: String, example: 'node' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 100 })
  @ResponseMessage('Get active skills catalog')
  getCatalog(@Query('search') search: string, @Query('limit') limit: string) {
    return this.skillsService.getCatalog(search, +limit);
  }

  @Post()
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Create a new catalog skill',
    description: 'Creates a canonical skill in the master catalog. Requires SUPER ADMIN.',
  })
  @ResponseMessage('Skill created successfully')
  create(@Body() createSkillDto: CreateSkillDto, @User() user: IUser) {
    return this.skillsService.create(createSkillDto, user);
  }

  @Get()
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get skills catalog entries',
    description: 'Retrieves a paginated list of skill catalog entries for admin management.',
  })
  @ResponseMessage('Skills have been retrieved successfully')
  findAll(@Query('page') page: string, @Query('limit') limit: string, @Query() query: string) {
    return this.skillsService.findAll(+page, +limit, query);
  }

  @Get(':id')
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get skill by ID',
    description: 'Retrieves a single skill catalog entry by ID. Requires SUPER ADMIN.',
  })
  @ResponseMessage('Skill has been retrieved successfully')
  findOne(@Param('id') id: string) {
    return this.skillsService.findOne(id);
  }

  @Patch(':id')
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Update skill by ID',
    description: 'Updates a skill catalog entry. Requires SUPER ADMIN.',
  })
  @ResponseMessage('Skill updated successfully')
  update(@Param('id') id: string, @Body() updateSkillDto: UpdateSkillDto, @User() user: IUser) {
    return this.skillsService.update(id, updateSkillDto, user);
  }

  @Delete('bulk')
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Bulk delete skills',
    description: 'Soft deletes multiple skill catalog entries by IDs. Requires SUPER ADMIN.',
  })
  @ResponseMessage('Bulk delete skills')
  bulkRemove(@Body() bulkDeleteDto: BulkDeleteDto, @User() user: IUser) {
    return this.skillsService.bulkRemove(bulkDeleteDto.ids, user);
  }

  @Delete(':id')
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Delete skill by ID',
    description: 'Soft deletes a skill catalog entry. Requires SUPER ADMIN.',
  })
  @ResponseMessage('Skill deleted successfully')
  remove(@Param('id') id: string, @User() user: IUser) {
    return this.skillsService.remove(id, user);
  }
}