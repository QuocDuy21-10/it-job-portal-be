import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { genSaltSync, hashSync } from 'bcryptjs';
import { Types } from 'mongoose';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';

import { ERole } from 'src/casl/enums/role.enum';
import { Company, CompanyDocument } from 'src/companies/schemas/company.schema';
import { Job, JobDocument } from 'src/jobs/schemas/job.schema';
import { Role, RoleDocument } from 'src/roles/schemas/role.schema';
import { Skill, SkillDocument } from 'src/skills/schemas/skill.schema';
import { User, UserDocument } from 'src/users/schemas/user.schema';

import { COMPANIES_SEED_DATA } from './data/companies.data';
import { createJobsSeedData } from './data/jobs.data';
import { ROLES_SEED_DATA } from './data/roles.data';
import { SKILLS_SEED_DATA } from './data/skills.data';
import { createUsersSeedData } from './data/users.data';

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectModel(Role.name) private readonly roleModel: SoftDeleteModel<RoleDocument>,
    @InjectModel(Skill.name) private readonly skillModel: SoftDeleteModel<SkillDocument>,
    @InjectModel(Company.name) private readonly companyModel: SoftDeleteModel<CompanyDocument>,
    @InjectModel(User.name) private readonly userModel: SoftDeleteModel<UserDocument>,
    @InjectModel(Job.name) private readonly jobModel: SoftDeleteModel<JobDocument>,
    private readonly configService: ConfigService,
  ) {}

  async run(): Promise<void> {
    this.validateEnv();

    const adminEmail = this.configService.get<string>('EMAIL_ADMIN')!;
    const initPassword = this.configService.get<string>('INIT_PASSWORD')!;
    const hashedPassword = hashSync(initPassword, genSaltSync(10));

    const seededRoleIds: Types.ObjectId[] = [];
    const seededSkillIds: Types.ObjectId[] = [];
    const seededCompanyIds: Types.ObjectId[] = [];
    const seededUserIds: Types.ObjectId[] = [];
    const seededJobIds: Types.ObjectId[] = [];

    try {
      const roleCount = await this.roleModel.countDocuments();
      if (roleCount === 0) {
        const inserted = await this.roleModel.insertMany(ROLES_SEED_DATA);
        inserted.forEach(doc => seededRoleIds.push(doc._id as Types.ObjectId));
        this.logger.log(`Roles seeded: ${seededRoleIds.length} records`);
      } else {
        this.logger.log('Roles already seeded, skipping');
      }
    } catch (err) {
      this.logger.error('Failed to seed roles', (err as Error).stack);
      throw err;
    }

    try {
      const skillCount = await this.skillModel.countDocuments();
      if (skillCount === 0) {
        const inserted = await this.skillModel.insertMany(SKILLS_SEED_DATA);
        inserted.forEach(doc => seededSkillIds.push(doc._id as Types.ObjectId));
        this.logger.log(`Skills seeded: ${seededSkillIds.length} records`);
      } else {
        this.logger.log('Skills already seeded, skipping');
      }
    } catch (err) {
      this.logger.error('Failed to seed skills', (err as Error).stack);
      await this.cleanup(seededRoleIds, this.roleModel);
      throw err;
    }

    // Resolve role ObjectIds (works whether just seeded or already existed)
    const adminRole = await this.roleModel.findOne({ name: ERole.SUPER_ADMIN }).lean();
    const userRole = await this.roleModel.findOne({ name: ERole.NORMAL_USER }).lean();
    if (!adminRole || !userRole) {
      throw new Error('Required roles not found after seeding — cannot continue');
    }

    try {
      const companyCount = await this.companyModel.countDocuments();
      if (companyCount === 0) {
        const inserted = await this.companyModel.insertMany(COMPANIES_SEED_DATA);
        inserted.forEach(doc => seededCompanyIds.push(doc._id as Types.ObjectId));
        this.logger.log(`Companies seeded: ${seededCompanyIds.length} records`);
      } else {
        this.logger.log('Companies already seeded, skipping');
      }
    } catch (err) {
      this.logger.error('Failed to seed companies', (err as Error).stack);
      await this.cleanup(seededSkillIds, this.skillModel);
      await this.cleanup(seededRoleIds, this.roleModel);
      throw err;
    }

    // Resolve company refs for job embedding
    const companies = await this.companyModel
      .find({}, '_id name logo')
      .lean<Array<{ _id: Types.ObjectId; name: string; logo?: string }>>();

    try {
      const userCount = await this.userModel.countDocuments();
      if (userCount === 0) {
        const usersData = createUsersSeedData(
          adminRole._id as Types.ObjectId,
          userRole._id as Types.ObjectId,
          adminEmail,
          hashedPassword,
        );
        const inserted = await this.userModel.insertMany(usersData);
        inserted.forEach(doc => seededUserIds.push(doc._id as Types.ObjectId));
        this.logger.log(`Users seeded: ${seededUserIds.length} records`);
      } else {
        this.logger.log('Users already seeded, skipping');
      }
    } catch (err) {
      this.logger.error('Failed to seed users', (err as Error).stack);
      await this.cleanup(seededCompanyIds, this.companyModel);
      await this.cleanup(seededSkillIds, this.skillModel);
      await this.cleanup(seededRoleIds, this.roleModel);
      throw err;
    }

    try {
      const jobCount = await this.jobModel.countDocuments();
      if (jobCount === 0) {
        const jobsData = createJobsSeedData(companies);
        const inserted = await this.jobModel.insertMany(jobsData);
        inserted.forEach(doc => seededJobIds.push(doc._id as Types.ObjectId));
        this.logger.log(`Jobs seeded: ${seededJobIds.length} records`);
      } else {
        this.logger.log('Jobs already seeded, skipping');
      }
    } catch (err) {
      this.logger.error('Failed to seed jobs', (err as Error).stack);
      await this.cleanup(seededUserIds, this.userModel);
      await this.cleanup(seededCompanyIds, this.companyModel);
      await this.cleanup(seededSkillIds, this.skillModel);
      await this.cleanup(seededRoleIds, this.roleModel);
      throw err;
    }

    this.logger.log('Seeding completed successfully');
  }

  private validateEnv(): void {
    const required = ['MONGO_URL', 'EMAIL_ADMIN', 'INIT_PASSWORD'];
    const missing = required.filter(key => !this.configService.get<string>(key));
    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables for seeding: ${missing.join(', ')}. Check your .env file.`,
      );
    }
  }

  private async cleanup(ids: Types.ObjectId[], model: SoftDeleteModel<any>): Promise<void> {
    if (ids.length === 0) return;
    await model.deleteMany({ _id: { $in: ids } });
    this.logger.warn(`Cleaned up ${ids.length} partially-seeded records from ${model.modelName}`);
  }
}
