import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument } from 'mongoose';
import { Role } from 'src/roles/schemas/role.schema';
import { Gender } from '../enums/user-gender.enum';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop()
  age?: number;

  @Prop({ enum: Gender })
  gender?: string;

  @Prop({ trim: true })
  address?: string;

  @Prop({ type: Object })
  company?: {
    _id: mongoose.Schema.Types.ObjectId;
    name: string;
    logo?: string;
  };

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: Role.name, required: true })
  role: mongoose.Schema.Types.ObjectId;

  @Prop()
  refreshToken?: string;

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

export const UserSchema = SchemaFactory.createForClass(User);

// TẠO PARTIAL UNIQUE INDEX
// Index này chỉ áp dụng cho documents có isDeleted = false
UserSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false },
  },
);

// Thêm index cho performance khi query
UserSchema.index({ email: 1, isDeleted: 1 });
UserSchema.index({ role: 1 });
