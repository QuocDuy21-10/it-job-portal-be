import { Controller, Get, Post, Body, Patch, Param, Delete, Res, Query } from '@nestjs/common';
import { ResumesService } from './resumes.service';
import { CreateResumeDto, CreateUserCvDto } from './dto/create-resume.dto';
import { UpdateResumeDto } from './dto/update-resume.dto';
import { ResponseMessage, SkipCheckPermission, User } from 'src/decorator/customize';
import { IUser } from 'src/users/users.interface';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Resume')
@Controller('resumes')
export class ResumesController {
  constructor(private readonly resumesService: ResumesService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new resume',
    description: 'Creates a new resume with the provided information. Requires authentication.',
  })
  @ResponseMessage('Resume created successfully')
  create(@Body() createUserCvDto: CreateUserCvDto, @User() user: IUser) {
    return this.resumesService.create(createUserCvDto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all resumes',
    description: 'Retrieves a paginated list of all resumes. Supports filtering and sorting.',
  })
  @ResponseMessage('Resumes have been retrieved successfully')
  findAll(@Query('page') page: string, @Query('limit') limit: string, @Query() query: string) {
    return this.resumesService.findAll(+page, +limit, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get resume by ID',
    description: 'Retrieves detailed information about a specific resume by its ID',
  })
  @ResponseMessage('Resume has been retrieved successfully')
  findOne(@Param('id') id: string) {
    return this.resumesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update resume by ID',
    description:
      'Updates an existing resume. Only the fields provided will be updated. Requires authentication.',
  })
  @ResponseMessage('Resume updated status successfully')
  update(@Param('id') id: string, @Body() updateResumeDto: UpdateResumeDto, @User() user: IUser) {
    return this.resumesService.update(id, updateResumeDto, user);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete resume by ID',
    description:
      'Soft deletes a resume. The resume will be marked as deleted but not removed from database. Requires authentication.',
  })
  @ResponseMessage('Resume deleted successfully')
  remove(@Param('id') id: string, @User() user: IUser) {
    return this.resumesService.remove(id, user);
  }

  @Post('by-user')
  @SkipCheckPermission()
  @ApiOperation({
    summary: 'Get resume by user',
    description: 'Retrieves resume associated with the authenticated user.',
  })
  @ResponseMessage('Resume has been retrieved successfully')
  getResumeByUser(@User() user: IUser) {
    return this.resumesService.getResumeByUser(user);
  }
}
