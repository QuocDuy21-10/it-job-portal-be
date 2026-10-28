import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { EJobLevel } from 'src/jobs/enums/job-level.enum';
import { EExternalJobStatus } from '../enums/external-job-status.enum';

export type ExternalJobDocument = HydratedDocument<ExternalJob>;

@Schema({ timestamps: true, collection: 'external_jobs' })
export class ExternalJob {
  @Prop({ required: true })
  sourceKey: string;

  @Prop({ required: true })
  externalId: string;

  @Prop({ required: true })
  sourceUrl: string;

  @Prop()
  applyUrl?: string;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true })
  companyName: string;

  @Prop({ required: true, trim: true })
  location: string;

  @Prop({ trim: true, lowercase: true })
  locationCode?: string;

  @Prop({ required: true, default: false })
  isRemote: boolean;

  @Prop({ type: [String], default: [] })
  skills: string[];

  @Prop({ enum: EJobLevel })
  level?: EJobLevel;

  @Prop({ required: true, default: '' })
  descriptionHtml: string;

  @Prop()
  publishedAt?: Date;

  @Prop()
  expiresAt?: Date;

  @Prop({ trim: true })
  salaryText?: string;

  @Prop({ required: true, enum: EExternalJobStatus, default: EExternalJobStatus.ACTIVE })
  status: EExternalJobStatus;

  @Prop({ required: true })
  lastSeenAt: Date;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const ExternalJobSchema = SchemaFactory.createForClass(ExternalJob);

ExternalJobSchema.index({ sourceKey: 1, externalId: 1 }, { unique: true });
ExternalJobSchema.index({ status: 1, publishedAt: -1 });
ExternalJobSchema.index({ locationCode: 1, status: 1 });
ExternalJobSchema.index({ skills: 1 });
