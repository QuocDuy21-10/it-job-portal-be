import { Module } from '@nestjs/common';
import { MatchingService } from './matching.service';
import { SkillsModule } from 'src/skills/skills.module';

@Module({
  imports: [SkillsModule],
  providers: [MatchingService],
  exports: [MatchingService],
})
export class MatchingModule {}
