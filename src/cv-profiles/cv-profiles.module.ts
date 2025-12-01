import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CvProfilesController } from './cv-profiles.controller';
import { CvProfilesService } from './cv-profiles.service';
import { CvProfile, CvProfileSchema } from './schemas/cv-profile.schema';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CvProfile.name, schema: CvProfileSchema },
    ]),
    FilesModule,
  ],
  controllers: [CvProfilesController],
  providers: [CvProfilesService],
  exports: [CvProfilesService],
})
export class CvProfilesModule {}
