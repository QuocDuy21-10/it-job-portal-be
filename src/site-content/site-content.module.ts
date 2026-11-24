import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FilesModule } from 'src/files/files.module';
import { BannersController } from './banners.controller';
import { BannersService } from './banners.service';
import { LegalPagesController } from './legal-pages.controller';
import { LegalPagesService } from './legal-pages.service';
import { Banner, BannerSchema } from './schemas/banner.schema';
import { LegalPage, LegalPageSchema } from './schemas/legal-page.schema';

@Module({
  imports: [
    FilesModule,
    MongooseModule.forFeature([
      { name: Banner.name, schema: BannerSchema },
      { name: LegalPage.name, schema: LegalPageSchema },
    ]),
  ],
  controllers: [BannersController, LegalPagesController],
  providers: [BannersService, LegalPagesService],
})
export class SiteContentModule {}
