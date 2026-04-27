import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument } from 'mongoose';

export type SkillDocument = HydratedDocument<Skill>;

@Schema({ timestamps: true })
export class Skill {
  @Prop({ required: true, trim: true })
  label: string;

  @Prop({ required: true, trim: true, lowercase: true })
  slug: string;

  @Prop({ type: [String], default: [] })
  aliases: string[];

  @Prop({ trim: true })
  category?: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ default: true })
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

export const SkillSchema = SchemaFactory.createForClass(Skill);

SkillSchema.index({ label: 1, isDeleted: 1 });
SkillSchema.index({ slug: 1, isDeleted: 1 });
SkillSchema.index({ isActive: 1, isDeleted: 1, label: 1 });
SkillSchema.index({ aliases: 1, isDeleted: 1 });
