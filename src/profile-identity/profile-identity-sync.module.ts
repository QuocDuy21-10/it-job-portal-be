import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CvProfile, CvProfileSchema } from 'src/cv-profiles/schemas/cv-profile.schema';
import { User, UserSchema } from 'src/users/schemas/user.schema';
import { ProfileIdentitySyncService } from './profile-identity-sync.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: CvProfile.name, schema: CvProfileSchema },
    ]),
  ],
  providers: [ProfileIdentitySyncService],
  exports: [ProfileIdentitySyncService],
})
export class ProfileIdentitySyncModule {}
