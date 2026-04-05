import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument } from 'mongoose';
import { EPermissionMethod } from '../enums/permission-method.enum';
import { EPermissionModule } from '../enums/permission-module.enum';

export type PermissionDocument = HydratedDocument<Permission>;

@Schema({ timestamps: true })
export class Permission {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true })
  apiPath: string;

  @Prop({ required: true, enum: EPermissionMethod })
  method: string;

  @Prop({ required: true, enum: EPermissionModule })
  module: string;

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

export const PermissionSchema = SchemaFactory.createForClass(Permission);
