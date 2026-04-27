import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { softDeletePlugin } from 'soft-delete-plugin-mongoose';

import { Company, CompanySchema } from 'src/companies/schemas/company.schema';
import { Job, JobSchema } from 'src/jobs/schemas/job.schema';
import { Role, RoleSchema } from 'src/roles/schemas/role.schema';
import { Skill, SkillSchema } from 'src/skills/schemas/skill.schema';
import { User, UserSchema } from 'src/users/schemas/user.schema';

import { SeedService } from './seed.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGO_URL'),
        connectionFactory: (connection: any) => {
          connection.plugin(softDeletePlugin);
          return connection;
        },
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      { name: Role.name, schema: RoleSchema },
      { name: Skill.name, schema: SkillSchema },
      { name: Company.name, schema: CompanySchema },
      { name: User.name, schema: UserSchema },
      { name: Job.name, schema: JobSchema },
    ]),
  ],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
