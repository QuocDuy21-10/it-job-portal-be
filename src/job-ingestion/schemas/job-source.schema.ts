import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { EJobSourceDisplayPolicy } from '../enums/job-source-display-policy.enum';
import { EJobSourceProvider } from '../enums/job-source-provider.enum';
import { ERejectionReason } from '../enums/rejection-reason.enum';
import { ESyncStatus } from '../enums/sync-status.enum';
import { ICrawlRunStats } from '../interfaces/crawl-run-stats.interface';
import { ISourceRejection } from '../interfaces/job-lifecycle.interface';

export type JobSourceDocument = HydratedDocument<JobSource>;

@Schema({ timestamps: true, collection: 'job_sources' })
export class JobSource {
  @Prop({ required: true, unique: true, trim: true })
  key: string;

  @Prop({ required: true, enum: EJobSourceProvider })
  provider: EJobSourceProvider;

  @Prop({ required: true, trim: true, match: /^[a-z0-9-]+$/ })
  boardToken: string;

  @Prop({ required: true, trim: true })
  companyName: string;

  @Prop({ required: true, default: true })
  enabled: boolean;

  @Prop()
  lastSyncedAt?: Date;

  @Prop({ enum: ESyncStatus })
  lastSyncStatus?: ESyncStatus;

  @Prop()
  lastSyncError?: string;

  @Prop({ enum: EJobSourceDisplayPolicy, default: EJobSourceDisplayPolicy.LINK_ONLY })
  displayPolicy?: EJobSourceDisplayPolicy;

  @Prop({ type: Object })
  lastSyncStats?: ICrawlRunStats;

  @Prop()
  lastSuccessfulListedCount?: number;

  @Prop({ default: 0 })
  consecutiveFailures?: number;

  @Prop({
    type: [
      {
        _id: false,
        externalId: { type: String, required: true },
        reason: { type: String, enum: ERejectionReason, required: true },
        retryAt: { type: Date, required: true },
      },
    ],
    default: [],
  })
  rejections?: ISourceRejection[];
}

export const JobSourceSchema = SchemaFactory.createForClass(JobSource);
