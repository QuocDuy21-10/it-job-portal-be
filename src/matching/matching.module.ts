import { Module } from '@nestjs/common';
import { MatchingService } from './matching.service';

/**
 * Matching Module
 * 
 * Module chuyên xử lý logic matching giữa CV và Job
 * Không phụ thuộc vào AI để tính điểm, chỉ dùng business rules
 * 
 * @architecture Hybrid Parsing Pipeline
 */
@Module({
  providers: [MatchingService],
  exports: [MatchingService],
})
export class MatchingModule {}
