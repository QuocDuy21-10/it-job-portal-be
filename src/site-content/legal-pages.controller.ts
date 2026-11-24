import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ERole, Roles } from 'src/casl';
import { IUser } from 'src/users/user.interface';
import { Public } from 'src/utils/decorators/public.decorator';
import { ResponseMessage } from 'src/utils/decorators/response-message.decorator';
import { User } from 'src/utils/decorators/user.decorator';
import { LegalPageParamsDto } from './dto/legal-page-params.dto';
import { UpdateLegalPageDto } from './dto/update-legal-page.dto';
import { LegalPagesService } from './legal-pages.service';

@ApiTags('Site Content')
@Controller('site-content/legal')
export class LegalPagesController {
  constructor(private readonly legalPagesService: LegalPagesService) {}

  @Public()
  @Get(':page/:locale')
  @ApiOperation({ summary: 'Terms of service or privacy policy in one language' })
  @ResponseMessage('Lấy nội dung trang thành công')
  findOne(@Param() params: LegalPageParamsDto) {
    return this.legalPagesService.findOne(params);
  }

  @Put(':page/:locale')
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create or replace the text of one legal page' })
  @ResponseMessage('Cập nhật nội dung trang thành công')
  update(
    @Param() params: LegalPageParamsDto,
    @Body() dto: UpdateLegalPageDto,
    @User() user: IUser,
  ) {
    return this.legalPagesService.update(params, dto, user);
  }
}
