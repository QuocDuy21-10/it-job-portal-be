import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Job, JobSchema } from 'src/jobs/schemas/job.schema';
import { Skill, SkillSchema } from './schemas/skill.schema';
import { SkillsController } from './skills.controller';
import { SkillsService } from './skills.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Skill.name, schema: SkillSchema },
      { name: Job.name, schema: JobSchema },
    ]),
  ],
  controllers: [SkillsController],
  providers: [SkillsService],
  exports: [SkillsService],
})
export class SkillsModule {}
