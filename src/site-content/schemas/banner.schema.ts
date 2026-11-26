import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ _id: false })
export class SlideText {
  @Prop({ required: true, trim: true, maxlength: 80 })
  title: string;

  @Prop({ type: String, trim: true, maxlength: 160, default: null })
  description?: string | null;

  @Prop({ type: String, trim: true, maxlength: 30, default: null })
  ctaLabel?: string | null;

  @Prop({ type: String, trim: true, maxlength: 500, default: null })
  ctaUrl?: string | null;
}

export const SlideTextSchema = SchemaFactory.createForClass(SlideText);

@Schema({ _id: false })
export class SlideContent {
  @Prop({ type: SlideTextSchema, required: true })
  vi: SlideText;

  @Prop({ type: SlideTextSchema, required: true })
  en: SlideText;
}

export const SlideContentSchema = SchemaFactory.createForClass(SlideContent);

export type BannerDocument = HydratedDocument<Banner>;

@Schema({ timestamps: true, collection: 'banners' })
export class Banner {
  @Prop({ required: true, trim: true, maxlength: 100 })
  name: string;

  @Prop({ required: true })
  fileName: string;

  // Shown on phones; the desktop image is used when it is null.
  @Prop({ type: String, default: null })
  mobileFileName?: string | null;

  @Prop({ type: SlideContentSchema, default: null })
  content?: SlideContent | null;

  @Prop({ required: true, default: false })
  isActive: boolean;

  @Prop({ type: Number, required: true })
  order: number;

  @Prop({ type: Date, default: null })
  startAt?: Date | null;

  @Prop({ type: Date, default: null })
  endAt?: Date | null;

  @Prop({ type: Object })
  createdBy?: { _id: string; email: string };

  @Prop({ type: Object })
  updatedBy?: { _id: string; email: string };

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const BannerSchema = SchemaFactory.createForClass(Banner);

// Order of the admin list and the public carousel.
BannerSchema.index({ order: 1 });
