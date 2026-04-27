import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Skill, SkillSchema } from './schemas/skill.schema';
import { SkillsController } from './skills.controller';
import { SkillsService } from './skills.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: Skill.name, schema: SkillSchema }])],
  controllers: [SkillsController],
  providers: [SkillsService],
  exports: [SkillsService],
})
export class SkillsModule {}