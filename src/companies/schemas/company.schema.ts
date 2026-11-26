import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument } from 'mongoose';
import { MAX_BENEFIT_NOTE_LENGTH } from '../company-profile.constants';
import { ECompanyBenefit } from '../enums/company-benefit.enum';
import { ECompanyIndustry } from '../enums/company-industry.enum';

export type CompanyDocument = HydratedDocument<Company>;

@Schema({ _id: false })
export class CompanyBenefit {
  @Prop({ type: String, enum: Object.values(ECompanyBenefit), required: true })
  type: ECompanyBenefit;

  @Prop({ type: String, trim: true, maxlength: MAX_BENEFIT_NOTE_LENGTH, default: null })
  note?: string | null;
}

export const CompanyBenefitSchema = SchemaFactory.createForClass(CompanyBenefit);

@Schema({ timestamps: true })
export class Company {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  address: string;

  @Prop({ required: true, trim: true })
  description: string;

  @Prop({ trim: true, default: null })
  website?: string;

  @Prop({ type: Number, default: 0 })
  numberOfEmployees?: number;

  @Prop({ trim: true, default: null })
  logo?: string;

  @Prop({ type: String, default: null })
  coverImage?: string | null;

  @Prop({ type: String, enum: Object.values(ECompanyIndustry), default: null })
  industry?: ECompanyIndustry | null;

  // Canonical skill labels from the skills catalog.
  @Prop({ type: [String], default: [] })
  techStack?: string[];

  @Prop({ type: [CompanyBenefitSchema], default: [] })
  benefits?: CompanyBenefit[];

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;

  @Prop()
  deletedAt?: Date;

  @Prop()
  isDeleted?: boolean;

  @Prop({ type: Object, default: null })
  createdBy?: {
    _id: mongoose.Schema.Types.ObjectId;
    email: string;
  };

  @Prop({ type: Object, default: null })
  updatedBy?: {
    _id: mongoose.Schema.Types.ObjectId;
    email: string;
  };

  @Prop({ type: Object, default: null })
  deletedBy?: {
    _id: mongoose.Schema.Types.ObjectId;
    email: string;
  };
}

export const CompanySchema = SchemaFactory.createForClass(Company);

CompanySchema.index({ name: 1, isDeleted: 1 });
CompanySchema.index({ createdAt: -1 });
CompanySchema.index({ industry: 1, isDeleted: 1 });
