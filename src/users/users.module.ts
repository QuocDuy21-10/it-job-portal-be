import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { Session, SessionSchema } from 'src/sessions/schemas/session.schema';
import { Job, JobSchema } from 'src/jobs/schemas/job.schema';
import { Company, CompanySchema } from 'src/companies/schemas/company.schema';
import { SessionsModule } from 'src/sessions/sessions.module';
import { UserRepository } from './repositories/user.repository';
import { UserAccountService } from './services/user-account.service';
import { UserPreferencesService } from './services/user-preferences.service';
import { ProfileIdentitySyncModule } from 'src/profile-identity/profile-identity-sync.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Session.name, schema: SessionSchema },
      { name: Job.name, schema: JobSchema },
      { name: Company.name, schema: CompanySchema },
    ]),
    SessionsModule,
    ProfileIdentitySyncModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, UserRepository, UserAccountService, UserPreferencesService],
  exports: [UsersService],
})
export class UsersModule {}
