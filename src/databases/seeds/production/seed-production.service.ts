import { randomBytes } from 'crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { genSaltSync, hashSync } from 'bcryptjs';
import { Model, Types } from 'mongoose';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';

import { EAuthProvider } from 'src/auth/enums/auth-provider.enum';
import { ERole } from 'src/casl/enums/role.enum';
import { Company, CompanyDocument } from 'src/companies/schemas/company.schema';
import { CvProfile, CvProfileDocument } from 'src/cv-profiles/schemas/cv-profile.schema';
import { Job, JobDocument } from 'src/jobs/schemas/job.schema';
import { User, UserDocument } from 'src/users/schemas/user.schema';

import { createProductionCvProfiles, PRODUCTION_CANDIDATES } from './candidates.production';
import { PRODUCTION_COMPANIES } from './companies.production';
import { createProductionJobs, JobActorRef, JobCompanyRef } from './jobs.production';

export const PRODUCTION_SAMPLE_CONFIRM_ENV = 'SEED_PRODUCTION_SAMPLE';

// Larger employers pay a little more than the base range.
const HIGH_PAYING = new Set([
  'techcombank',
  'vnpay',
  'vng-corporation',
  'momo',
  'shopee-vietnam',
  'grab-vietnam',
  'lazada-vietnam',
  'bosch-global-software-technologies',
  'vinfast',
  'sky-mavis',
  'trusting-social',
  'masan-group',
]);

const RECRUITERS = [
  'Nguyễn Thu Hằng',
  'Trần Minh Châu',
  'Lê Thị Phương Thảo',
  'Phạm Quỳnh Anh',
  'Hoàng Thị Lan',
  'Vũ Ngọc Mai',
  'Đặng Thị Thanh Hà',
  'Bùi Hồng Nhung',
  'Đỗ Thùy Linh',
  'Ngô Thị Hạnh',
  'Dương Mỹ Linh',
  'Lý Thị Hoài',
  'Phan Khánh Vy',
  'Trịnh Thị Hiền',
  'Đinh Ngọc Ánh',
  'Mai Thị Thu',
  'Võ Phương Nhi',
  'Lâm Thị Kim Chi',
  'Tô Thanh Vân',
  'Hồ Thị Diệu',
  'Cao Thùy Dung',
  'Nguyễn Thị Hồng Nhung',
  'Trần Thị Bảo Ngọc',
  'Lê Thị Kiều Trang',
  'Phạm Thị Tuyết',
];

const SAVED_JOBS_PER_CANDIDATE = 4;
const FOLLOWED_COMPANIES_PER_CANDIDATE = 3;

@Injectable()
export class SeedProductionService {
  private readonly logger = new Logger(SeedProductionService.name);

  constructor(
    @InjectModel(Company.name) private readonly companyModel: SoftDeleteModel<CompanyDocument>,
    @InjectModel(User.name) private readonly userModel: SoftDeleteModel<UserDocument>,
    @InjectModel(Job.name) private readonly jobModel: SoftDeleteModel<JobDocument>,
    @InjectModel(CvProfile.name) private readonly cvProfileModel: Model<CvProfileDocument>,
    private readonly configService: ConfigService,
  ) {}

  async run(): Promise<void> {
    // Explicit opt-in: this writes sample accounts and jobs, so it never runs by accident.
    if (this.configService.get<string>(PRODUCTION_SAMPLE_CONFIRM_ENV) !== 'yes') {
      throw new Error(`Set ${PRODUCTION_SAMPLE_CONFIRM_ENV}=yes to seed production sample data`);
    }

    const adminEmail = this.configService.get<string>('EMAIL_ADMIN')!.toLowerCase();
    const admin = await this.userModel.findOne({ email: adminEmail }, '_id email').lean();

    if (!admin) {
      throw new Error(`Admin ${adminEmail} not found; run the base seed first`);
    }

    // Sample accounts get a random password nobody knows: they exist to populate the UI, not to log in.
    const hashedPassword = hashSync(randomBytes(24).toString('hex'), genSaltSync(10));
    const adminRef: JobActorRef = { _id: admin._id as Types.ObjectId, email: admin.email };

    const companies = await this.seedCompanies();
    const hrByCompany = await this.seedHrUsers(companies, hashedPassword);
    const jobs = await this.seedJobs(companies, hrByCompany, adminRef);
    const candidates = await this.seedCandidates(hashedPassword);

    await this.seedCvProfiles(candidates);
    await this.syncCandidateReferences(candidates, companies, jobs);
    this.logger.log('Production sample seeding completed');
  }

  private async seedCompanies(): Promise<JobCompanyRef[]> {
    const names = PRODUCTION_COMPANIES.map(company => company.name);
    const existing = new Set(
      (await this.companyModel.find({ name: { $in: names } }, 'name').lean()).map(c => c.name),
    );
    const missing = PRODUCTION_COMPANIES.filter(company => !existing.has(company.name)).map(
      company => ({
        name: company.name,
        address: company.address,
        description: company.description,
        website: company.website,
        numberOfEmployees: company.numberOfEmployees,
        logo: `${company.slug}.png`,
      }),
    );

    if (missing.length > 0) {
      await this.companyModel.insertMany(missing);
    }
    this.logger.log(`Companies: ${missing.length} created, ${existing.size} already present`);

    const docs = await this.companyModel.find({ name: { $in: names } }, '_id name logo').lean();
    const byName = new Map(docs.map(doc => [doc.name, doc]));

    return PRODUCTION_COMPANIES.map(company => {
      const doc = byName.get(company.name)!;

      return {
        _id: doc._id as Types.ObjectId,
        slug: company.slug,
        name: company.name,
        logo: doc.logo ?? `${company.slug}.png`,
        tier: HIGH_PAYING.has(company.slug) ? 1.2 : 1,
        city: company.city,
        sector: company.sector,
      };
    });
  }

  private async seedHrUsers(
    companies: JobCompanyRef[],
    password: string,
  ): Promise<Map<string, JobActorRef>> {
    const hrs = companies.map((company, index) => ({
      name: RECRUITERS[index % RECRUITERS.length],
      email: `tuyendung.${company.slug}@example.com`,
      password,
      authProvider: EAuthProvider.LOCAL,
      role: ERole.HR,
      isActive: true,
      isLocked: false,
      company: { _id: company._id, name: company.name, logo: company.logo },
      savedJobs: [],
      companyFollowed: [],
    }));

    const existing = new Set(
      (await this.userModel.find({ email: { $in: hrs.map(h => h.email) } }, 'email').lean()).map(
        u => u.email,
      ),
    );
    const missing = hrs.filter(hr => !existing.has(hr.email));

    if (missing.length > 0) {
      await this.userModel.insertMany(missing);
    }
    this.logger.log(`HR users: ${missing.length} created`);

    const docs = await this.userModel
      .find({ email: { $in: hrs.map(h => h.email) } }, '_id email')
      .lean();
    const byEmail = new Map(docs.map(doc => [doc.email, doc]));

    return new Map(
      companies.map(company => {
        const doc = byEmail.get(`tuyendung.${company.slug}@example.com`)!;

        return [company.slug, { _id: doc._id as Types.ObjectId, email: doc.email }];
      }),
    );
  }

  private async seedJobs(
    companies: JobCompanyRef[],
    hrByCompany: Map<string, JobActorRef>,
    admin: JobActorRef,
  ) {
    const jobs = createProductionJobs(companies, hrByCompany, admin);
    const companyIds = companies.map(company => company._id);
    const existing = await this.jobModel
      .find({ 'company._id': { $in: companyIds } }, 'name company._id')
      .lean();
    const keys = new Set(existing.map(job => `${job.company._id}:${job.name}`));
    const missing = jobs.filter(job => !keys.has(`${job.company._id}:${job.name}`));

    if (missing.length > 0) {
      await this.jobModel.insertMany(missing);
    }
    this.logger.log(
      `Jobs: ${missing.length} created, ${jobs.length - missing.length} already present`,
    );

    return this.jobModel
      .find({ 'company._id': { $in: companyIds }, approvalStatus: 'APPROVED' }, '_id')
      .lean();
  }

  private async seedCandidates(password: string) {
    const emails = PRODUCTION_CANDIDATES.map(candidate => candidate.email);
    const existing = new Set(
      (await this.userModel.find({ email: { $in: emails } }, 'email').lean()).map(u => u.email),
    );
    const missing = PRODUCTION_CANDIDATES.filter(c => !existing.has(c.email)).map(c => ({
      ...c,
      password,
      authProvider: EAuthProvider.LOCAL,
      role: ERole.NORMAL_USER,
      isActive: true,
      isLocked: false,
      savedJobs: [],
      companyFollowed: [],
    }));

    if (missing.length > 0) {
      await this.userModel.insertMany(missing);
    }
    this.logger.log(`Candidates: ${missing.length} created`);

    const docs = await this.userModel.find({ email: { $in: emails } }, '_id name email').lean();

    return docs.map(doc => ({ _id: doc._id as Types.ObjectId, name: doc.name, email: doc.email }));
  }

  private async seedCvProfiles(
    candidates: Array<{ _id: Types.ObjectId; name: string; email: string }>,
  ) {
    const existing = new Set(
      (
        await this.cvProfileModel
          .find({ userId: { $in: candidates.map(c => c._id) } }, 'userId')
          .lean()
      ).map(p => String(p.userId)),
    );
    const missing = createProductionCvProfiles(candidates).filter(
      profile => !existing.has(String(profile.userId)),
    );

    if (missing.length > 0) {
      await this.cvProfileModel.insertMany(missing);
    }
    this.logger.log(`CV profiles: ${missing.length} created`);
  }

  private async syncCandidateReferences(
    candidates: Array<{ _id: Types.ObjectId }>,
    companies: JobCompanyRef[],
    jobs: Array<{ _id: Types.ObjectId }>,
  ) {
    await this.userModel.bulkWrite(
      candidates.map((candidate, index) => ({
        updateOne: {
          // Only fill candidates that have no saved jobs yet, so re-runs keep later user activity.
          filter: { _id: candidate._id, savedJobs: { $size: 0 } },
          update: {
            $set: {
              savedJobs: Array.from(
                { length: SAVED_JOBS_PER_CANDIDATE },
                (_, i) => jobs[(index * 11 + i * 17) % jobs.length]._id,
              ),
              companyFollowed: Array.from(
                { length: FOLLOWED_COMPANIES_PER_CANDIDATE },
                (_, i) => companies[(index * 3 + i * 5) % companies.length]._id,
              ),
            },
          },
        },
      })),
    );
  }
}
