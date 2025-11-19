import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument } from 'mongoose';
import { Company } from 'src/companies/schemas/company.schema';
import { Job } from 'src/jobs/schemas/job.schema';
import { ResumeStatus } from '../enums/resume-status.enum';
import { ResumePriority } from '../enums/resume-priority.enum';

export type ResumeDocument = HydratedDocument<Resume>;

// Parsed Data Structure
class ParsedExperience {
  @Prop()
  company: string;

  @Prop()
  position: string;

  @Prop()
  duration: string;

  @Prop()
  description: string;
}

class ParsedEducation {
  @Prop()
  school: string;

  @Prop()
  degree: string;

  @Prop()
  major: string;

  @Prop()
  duration: string;

  @Prop()
  gpa?: string;
}

class ParsedData {
  @Prop()
  fullName?: string;

  @Prop()
  email?: string;

  @Prop()
  phone?: string;

  @Prop({ type: [String] })
  skills?: string[];

  @Prop({ type: [ParsedExperience] })
  experience?: ParsedExperience[];

  @Prop({ type: [ParsedEducation] })
  education?: ParsedEducation[];

  @Prop()
  summary?: string;

  @Prop()
  yearsOfExperience?: number;
}

// AI Analysis Structure
class SkillMatch {
  @Prop()
  skill: string;

  @Prop()
  matched: boolean;

  @Prop()
  proficiencyLevel?: string;
}

class AIAnalysis {
  @Prop({ min: 0, max: 100 })
  matchingScore?: number;

  @Prop({ type: [SkillMatch] })
  skillsMatch?: SkillMatch[];

  @Prop()
  strengths?: string[];

  @Prop()
  weaknesses?: string[];

  @Prop()
  summary?: string;

  @Prop()
  recommendation?: string;

  @Prop()
  analyzedAt?: Date;
}

@Schema({ timestamps: true })
export class Resume {
  @Prop()
  email: string;

  @Prop()
  userId: mongoose.Schema.Types.ObjectId;

  @Prop()
  url: string;

  @Prop({ required: true, enum: ResumeStatus, default: ResumeStatus.PENDING })
  status: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: Company.name })
  companyId?: mongoose.Schema.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: Job.name })
  jobId?: mongoose.Schema.Types.ObjectId;

  // ========== NEW FIELDS FOR CV PARSER & AI MATCHING ==========

  @Prop({ type: ParsedData })
  parsedData?: ParsedData;

  @Prop({ type: AIAnalysis })
  aiAnalysis?: AIAnalysis;

  @Prop({ enum: ResumePriority, default: ResumePriority.LOW, index: true })
  priority?: string;

  @Prop()
  adminNotes?: string;

  @Prop()
  hrNotes?: string;

  @Prop({ default: false })
  isParsed?: boolean;

  @Prop({ default: false })
  isAnalyzed?: boolean;

  @Prop()
  parseError?: string;

  @Prop()
  analysisError?: string;

  @Prop({ type: Object })
  cvStructuredData?: any; // Snapshot of CvProfile at application time

  // ============================================================

  @Prop({ type: mongoose.Schema.Types.Array })
  histories: {
    status: string;
    updatedAt: Date;
    updatedBy: {
      _id: mongoose.Schema.Types.ObjectId;
      email: string;
    };
  }[];

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

export const ResumeSchema = SchemaFactory.createForClass(Resume);

// ========== INDEXES FOR OPTIMIZATION ==========
ResumeSchema.index({ status: 1, priority: 1 });
ResumeSchema.index({ companyId: 1, status: 1, priority: 1 });
ResumeSchema.index({ 'aiAnalysis.matchingScore': -1 });
ResumeSchema.index({ jobId: 1, status: 1 });
ResumeSchema.index({ userId: 1, createdAt: -1 });
ResumeSchema.index({ isParsed: 1, isAnalyzed: 1 });
