import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose from 'mongoose';

@Schema({ _id: false, id: false })
export class CompanySnapshot {
  @Prop({ type: mongoose.Schema.Types.ObjectId, required: true })
  _id: mongoose.Schema.Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true, default: null })
  logo?: string | null;
}

export const CompanySnapshotSchema = SchemaFactory.createForClass(CompanySnapshot);
