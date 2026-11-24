import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ERole, Roles } from 'src/casl';
import { IUser } from 'src/users/user.interface';
import { Public } from 'src/utils/decorators/public.decorator';
import { ResponseMessage } from 'src/utils/decorators/response-message.decorator';
import { User } from 'src/utils/decorators/user.decorator';
import { BannersService } from './banners.service';
import { CreateBannerDto } from './dto/create-banner.dto';

@ApiTags('Site Content')
@Controller('site-content/banners')
export class BannersController {
  constructor(private readonly bannersService: BannersService) {}

  @Public()
  @Get('active')
  @ApiOperation({ summary: 'Active home banner, or null when the default image is used' })
  @ResponseMessage('Lấy banner đang hiển thị thành công')
  findActive() {
    return this.bannersService.findActive();
  }

  @Get()
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List banners, newest first' })
  @ResponseMessage('Lấy danh sách banner thành công')
  findAll() {
    return this.bannersService.findAll();
  }

  @Post()
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Add an uploaded image to the banner library' })
  @ResponseMessage('Thêm banner thành công')
  create(@Body() dto: CreateBannerDto, @User() user: IUser) {
    return this.bannersService.create(dto, user);
  }

  @Patch(':id/activate')
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Show this banner on the home page' })
  @ResponseMessage('Đã đặt banner hiển thị')
  activate(@Param('id') id: string) {
    return this.bannersService.activate(id);
  }

  // Declared before ':id' so 'active' is not read as an id.
  @Delete('active')
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Go back to the default image' })
  @ResponseMessage('Đã dùng lại ảnh mặc định')
  clearActive() {
    return this.bannersService.clearActive();
  }

  @Delete(':id')
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete a banner that is not shown, with its file' })
  @ResponseMessage('Xoá banner thành công')
  remove(@Param('id') id: string) {
    return this.bannersService.remove(id);
  }
}
