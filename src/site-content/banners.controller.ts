import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ERole, Roles } from 'src/casl';
import { IUser } from 'src/users/user.interface';
import { Public } from 'src/utils/decorators/public.decorator';
import { ResponseMessage } from 'src/utils/decorators/response-message.decorator';
import { User } from 'src/utils/decorators/user.decorator';
import { BannersService } from './banners.service';
import { BannerVisibilityDto } from './dto/banner-visibility.dto';
import { CreateBannerDto } from './dto/create-banner.dto';
import { ReorderBannersDto } from './dto/reorder-banners.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';

@ApiTags('Site Content')
@Controller('site-content/banners')
export class BannersController {
  constructor(private readonly bannersService: BannersService) {}

  @Public()
  @Get('public')
  @ApiOperation({ summary: 'Hero slides visible now, in display order' })
  @ResponseMessage('Lấy danh sách banner hiển thị thành công')
  findPublic() {
    return this.bannersService.findPublic();
  }

  @Get()
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List every slide in display order, with its status' })
  @ResponseMessage('Lấy danh sách banner thành công')
  findAll() {
    return this.bannersService.findAll();
  }

  @Post()
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Add a hidden slide at the end of the list' })
  @ResponseMessage('Thêm banner thành công')
  create(@Body() dto: CreateBannerDto, @User() user: IUser) {
    return this.bannersService.create(dto, user);
  }

  // Declared before ':id' routes so 'order' is not read as an id.
  @Put('order')
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Set the display order of every slide' })
  @ResponseMessage('Đã sắp xếp banner')
  reorder(@Body() dto: ReorderBannersDto) {
    return this.bannersService.reorder(dto.ids);
  }

  @Patch(':id')
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Edit a slide; a replaced image file is deleted' })
  @ResponseMessage('Cập nhật banner thành công')
  update(@Param('id') id: string, @Body() dto: UpdateBannerDto, @User() user: IUser) {
    return this.bannersService.update(id, dto, user);
  }

  @Patch(':id/visibility')
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Show or hide a slide (at most 5 on)' })
  @ResponseMessage('Đã đổi trạng thái hiển thị banner')
  setVisibility(@Param('id') id: string, @Body() dto: BannerVisibilityDto, @User() user: IUser) {
    return this.bannersService.setVisibility(id, dto.isActive, user);
  }

  @Delete(':id')
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete a slide and its image files' })
  @ResponseMessage('Xoá banner thành công')
  remove(@Param('id') id: string) {
    return this.bannersService.remove(id);
  }
}
