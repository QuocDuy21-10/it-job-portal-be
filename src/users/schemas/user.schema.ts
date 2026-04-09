import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument } from 'mongoose';
import { Role } from 'src/roles/schemas/role.schema';
import { EAuthProvider } from 'src/auth/enums/auth-provider.enum';
import { CompanySnapshot, CompanySnapshotSchema } from 'src/companies/schemas/company-snapshot.schema';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: false })
  password: string;

  @Prop({ type: String, enum: EAuthProvider, default: EAuthProvider.LOCAL })
  authProvider: string;

  @Prop({ unique: true, sparse: true })
  googleId?: string;

  @Prop({ trim: true })
  avatar?: string;

  @Prop({ default: false })
  isActive: boolean;

  @Prop()
  codeExpired: Date;

  @Prop({ type: Date, required: false })
  verificationExpires?: Date;

  @Prop({ type: CompanySnapshotSchema, required: false })
  company?: CompanySnapshot;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: Role.name, required: true })
  role: mongoose.Schema.Types.ObjectId;

  @Prop({ type: [mongoose.Schema.Types.ObjectId], ref: 'Job', default: [] })
  savedJobs: mongoose.Schema.Types.ObjectId[];

  @Prop({ type: [mongoose.Schema.Types.ObjectId], ref: 'Company', default: [] })
  companyFollowed: mongoose.Schema.Types.ObjectId[];

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

UserSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false },
  },
);

UserSchema.index({ email: 1, isDeleted: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ companyFollowed: 1 });
UserSchema.index({ savedJobs: 1 });

UserSchema.index(
  { verificationExpires: 1 },
  {
    expireAfterSeconds: 0,
    partialFilterExpression: { isActive: false },
  },
);
