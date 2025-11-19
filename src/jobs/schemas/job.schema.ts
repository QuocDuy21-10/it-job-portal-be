import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument } from 'mongoose';
import { JobLevel } from '../enums/job-level.enum';
import { JobFormOfWork } from '../enums/job-formwork';

export type JobDocument = HydratedDocument<Job>;

@Schema({ timestamps: true })
export class Job {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true })
  skills: string[];

  @Prop({ type: Object, required: true })
  company: {
    _id: mongoose.Schema.Types.ObjectId;
    name: string;
    logo?: string;
  };

  @Prop({ required: true, trim: true })
  location: string;

  @Prop({ required: true, trim: true })
  salary: number;

  @Prop({ required: true })
  quantity: number;

  @Prop({ required: true, trim: true, enum: JobLevel })
  level: string;

  @Prop({ trim: true, enum: JobFormOfWork })
  formOfWork: string;

  @Prop()
  description: string;

  @Prop()
  startDate: Date;

  @Prop()
  endDate: Date;

  @Prop({ default: true, required: true })
  isActive: boolean;

  @Prop({ type: Object })
  createdBy?: {
    _id: mongoose.Schema.Types.ObjectId;
    email: string;
  };

  @Prop({ type: Object })
  updatedBy?: {
    _id: mongoose.Schema.Types.ObjectId;
    email: string;
  };

  @Prop({ type: Object })
  deletedBy?: {
    _id: mongoose.Schema.Types.ObjectId;
    email: string;
  };

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;

  @Prop()
  isDeleted?: boolean;

  @Prop()
  deletedAt?: Date;
}

export const JobSchema = SchemaFactory.createForClass(Job);

// ========== INDEXES FOR OPTIMIZATION ==========
// Compound index for common query patterns
JobSchema.index({ 'company._id': 1, isActive: 1, isDeleted: 1 });
JobSchema.index({ isActive: 1, endDate: 1, isDeleted: 1 });

// Individual field indexes for filtering
JobSchema.index({ skills: 1 });
JobSchema.index({ level: 1 });
JobSchema.index({ location: 1 });
JobSchema.index({ createdAt: -1 });

// Text index for search functionality
JobSchema.index({ name: 'text', description: 'text' });
