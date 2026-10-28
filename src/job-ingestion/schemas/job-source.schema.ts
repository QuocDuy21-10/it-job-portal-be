import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { EJobSourceProvider } from '../enums/job-source-provider.enum';
import { ESyncStatus } from '../enums/sync-status.enum';

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

  @Prop({ type: Object })
  lastSyncStats?: {
    fetched: number;
    kept: number;
    skipped: number;
    upserted: number;
    closed: number;
  };

  @Prop({ type: [String], default: [] })
  rejectedExternalIds: string[];
}

export const JobSourceSchema = SchemaFactory.createForClass(JobSource);
