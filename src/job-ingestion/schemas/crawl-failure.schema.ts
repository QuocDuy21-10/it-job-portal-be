import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ERejectionReason } from '../enums/rejection-reason.enum';

export type CrawlFailureDocument = HydratedDocument<CrawlFailure>;

/** The last reason one listed job could not be stored. Gone once the job is kept or unlisted. */
@Schema({ collection: 'crawl_failures' })
export class CrawlFailure {
  @Prop({ required: true })
  sourceKey: string;

  @Prop({ required: true })
  externalId: string;

  @Prop()
  url?: string;

  @Prop()
  title?: string;

  @Prop({ required: true, enum: ERejectionReason })
  reason: ERejectionReason;

  @Prop()
  detail?: string;

  @Prop({ required: true })
  failedAt: Date;

  @Prop({ required: true })
  retryAt: Date;
}

export const CrawlFailureSchema = SchemaFactory.createForClass(CrawlFailure);

CrawlFailureSchema.index({ sourceKey: 1, externalId: 1 }, { unique: true });
CrawlFailureSchema.index({ reason: 1, failedAt: -1 });
