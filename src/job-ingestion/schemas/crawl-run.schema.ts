import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ESyncStatus } from '../enums/sync-status.enum';
import { ICrawlRunStats } from '../interfaces/crawl-run-stats.interface';
import { CRAWL_RUN_TTL_SECONDS } from '../job-ingestion.constants';

export type CrawlRunDocument = HydratedDocument<CrawlRun>;

@Schema({ collection: 'crawl_runs' })
export class CrawlRun {
  @Prop({ required: true })
  sourceKey: string;

  @Prop({ required: true })
  startedAt: Date;

  @Prop()
  finishedAt?: Date;

  @Prop({ required: true, enum: ESyncStatus })
  status: ESyncStatus;

  @Prop()
  stoppedReason?: string;

  @Prop()
  error?: string;

  @Prop({ type: Object })
  stats?: ICrawlRunStats;
}

export const CrawlRunSchema = SchemaFactory.createForClass(CrawlRun);

CrawlRunSchema.index({ sourceKey: 1, startedAt: -1 });
CrawlRunSchema.index({ startedAt: 1 }, { expireAfterSeconds: CRAWL_RUN_TTL_SECONDS });
