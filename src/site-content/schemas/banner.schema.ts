import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BannerDocument = HydratedDocument<Banner>;

@Schema({ timestamps: true, collection: 'banners' })
export class Banner {
  @Prop({ required: true, trim: true, maxlength: 100 })
  name: string;

  @Prop({ required: true })
  fileName: string;

  @Prop({ required: true, default: false })
  isActive: boolean;

  @Prop({ type: Object })
  createdBy?: { _id: string; email: string };

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const BannerSchema = SchemaFactory.createForClass(Banner);

// At most one active banner; a concurrent activation loses with a duplicate-key error (409).
BannerSchema.index({ isActive: 1 }, { unique: true, partialFilterExpression: { isActive: true } });
