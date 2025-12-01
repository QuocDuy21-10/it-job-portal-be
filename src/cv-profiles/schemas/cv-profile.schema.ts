import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CvProfileDocument = HydratedDocument<CvProfile>;

/**
 * Personal Information Sub-Schema
 * Maps to CVData.personalInfo
 */
@Schema({ _id: false })
export class PersonalInfo {
  @Prop({ required: true })
  fullName: string;

  @Prop()
  title: string;

  @Prop()
  avatar: string;

  @Prop({ required: true })
  phone: string;

  @Prop({ required: true })
  email: string;

  @Prop()
  birthday: string;

  @Prop()
  gender: string;

  @Prop()
  address: string;

  @Prop()
  personalLink: string;

  @Prop()
  bio: string;
}

/**
 * Education Sub-Schema
 * Maps to CVData.education[]
 */
@Schema({ _id: false })
export class Education {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  school: string;

  @Prop({ required: true })
  degree: string;

  @Prop({ required: true })
  field: string;

  @Prop({ required: true })
  startDate: string;

  @Prop({ required: true })
  endDate: string;

  @Prop()
  description: string;
}

/**
 * Experience Sub-Schema
 * Maps to CVData.experience[]
 */
@Schema({ _id: false })
export class Experience {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  company: string;

  @Prop({ required: true })
  position: string;

  @Prop({ required: true })
  startDate: string;

  @Prop({ required: true })
  endDate: string;

  @Prop()
  description: string;
}

/**
 * Skill Sub-Schema
 * Maps to CVData.skills[]
 */
@Schema({ _id: false })
export class Skill {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  level: string;
}

/**
 * Language Sub-Schema
 * Maps to CVData.languages[]
 */
@Schema({ _id: false })
export class Language {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  proficiency: string;
}

/**
 * Project Sub-Schema
 * Maps to CVData.projects[]
 */
@Schema({ _id: false })
export class Project {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  description: string;

  @Prop()
  link: string;
}

/**
 * Certificate Sub-Schema
 * Maps to CVData.certificates[]
 */
@Schema({ _id: false })
export class Certificate {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  issuer: string;

  @Prop({ required: true })
  date: string;
}

/**
 * Award Sub-Schema
 * Maps to CVData.awards[]
 */
@Schema({ _id: false })
export class Award {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  date: string;

  @Prop()
  description: string;
}

/**
 * Main CV Profile Schema
 * Maps to interface CVData
 * Relationship: User (1) --- (1) CvProfile
 */
@Schema({ timestamps: true })
export class CvProfile {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  @Prop({ type: PersonalInfo, required: true })
  personalInfo: PersonalInfo;

  @Prop({ type: [Education], default: [] })
  education: Education[];

  @Prop({ type: [Experience], default: [] })
  experience: Experience[];

  @Prop({ type: [Skill], default: [] })
  skills: Skill[];

  @Prop({ type: [Language], default: [] })
  languages: Language[];

  @Prop({ type: [Project], default: [] })
  projects: Project[];

  @Prop({ type: [Certificate], default: [] })
  certificates: Certificate[];

  @Prop({ type: [Award], default: [] })
  awards: Award[];

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  lastUpdated: Date;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const CvProfileSchema = SchemaFactory.createForClass(CvProfile);

// Indexes for performance
CvProfileSchema.index({ userId: 1 });
CvProfileSchema.index({ 'personalInfo.email': 1 });
CvProfileSchema.index({ 'personalInfo.phone': 1 });

// Pre-save hook to update lastUpdated
CvProfileSchema.pre('save', function (next) {
  this.lastUpdated = new Date();
  next();
});
