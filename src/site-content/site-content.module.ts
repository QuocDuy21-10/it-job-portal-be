import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FilesModule } from 'src/files/files.module';
import { BannersController } from './banners.controller';
import { BannersService } from './banners.service';
import { Banner, BannerSchema } from './schemas/banner.schema';

@Module({
  imports: [FilesModule, MongooseModule.forFeature([{ name: Banner.name, schema: BannerSchema }])],
  controllers: [BannersController],
  providers: [BannersService],
})
export class SiteContentModule {}
