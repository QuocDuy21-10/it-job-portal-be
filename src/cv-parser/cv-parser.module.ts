import { Module } from '@nestjs/common';
import { CvParserService } from './cv-parser.service';

@Module({
  providers: [CvParserService],
  exports: [CvParserService],
})
export class CvParserModule {}
