import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { LEGAL_LOCALES, LEGAL_PAGES, LegalLocale, LegalPageKey } from '../site-content.constants';

export type LegalPageDocument = HydratedDocument<LegalPage>;

@Schema({ timestamps: true, collection: 'legal_pages' })
export class LegalPage {
  @Prop({ required: true, type: String, enum: LEGAL_PAGES })
  page: LegalPageKey;

  @Prop({ required: true, type: String, enum: LEGAL_LOCALES })
  locale: LegalLocale;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true })
  description: string;

  // Stored as written; the frontend sanitizes it before rendering.
  @Prop({ required: true })
  contentHtml: string;

  @Prop({ required: true, default: false })
  isPublished: boolean;

  @Prop({ type: Object })
  updatedBy?: { _id: string; email: string };

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const LegalPageSchema = SchemaFactory.createForClass(LegalPage);

LegalPageSchema.index({ page: 1, locale: 1 }, { unique: true });
