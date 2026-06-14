import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { genSaltSync, hashSync } from 'bcryptjs';
import { Model, Types } from 'mongoose';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';

import { Company, CompanyDocument } from 'src/companies/schemas/company.schema';
import { CvProfile, CvProfileDocument } from 'src/cv-profiles/schemas/cv-profile.schema';
import { Job, JobDocument } from 'src/jobs/schemas/job.schema';
import { Resume, ResumeDocument } from 'src/resumes/schemas/resume.schema';
import { Skill, SkillDocument } from 'src/skills/schemas/skill.schema';
import { User, UserDocument } from 'src/users/schemas/user.schema';

import { COMPANIES_SEED_DATA } from './data/companies.data';
import { CandidateUserRef, createCvProfilesSeedData, CvProfileSeed } from './data/cv-profiles.data';
import { createJobsSeedData, JobSeed } from './data/jobs.data';
import { createResumesSeedData, ResumeSeed } from './data/resumes.data';
import { SKILLS_SEED_DATA } from './data/skills.data';
import { createUsersSeedData, getSeedUserEmails, SeedCompanyRef } from './data/users.data';

type SeedCompanyDocument = SeedCompanyRef & {
  _id: Types.ObjectId;
};

type SeedUserDocument = CandidateUserRef & {
  role: string;
};

type SeedJobDocument = {
  _id: Types.ObjectId;
  name: string;
  skills: string[];
  company: {
    _id: Types.ObjectId;
    name: string;
    logo?: string | null;
  };
};

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectModel(Skill.name) private readonly skillModel: SoftDeleteModel<SkillDocument>,
    @InjectModel(Company.name) private readonly companyModel: SoftDeleteModel<CompanyDocument>,
    @InjectModel(User.name) private readonly userModel: SoftDeleteModel<UserDocument>,
    @InjectModel(Job.name) private readonly jobModel: SoftDeleteModel<JobDocument>,
    @InjectModel(CvProfile.name) private readonly cvProfileModel: Model<CvProfileDocument>,
    @InjectModel(Resume.name) private readonly resumeModel: Model<ResumeDocument>,
    private readonly configService: ConfigService,
  ) {}

  async run(): Promise<void> {
    this.validateEnv();

    const adminEmail = this.configService.get<string>('EMAIL_ADMIN')!.toLowerCase();
    const initPassword = this.configService.get<string>('INIT_PASSWORD')!;
    const hashedPassword = hashSync(initPassword, genSaltSync(10));

    await this.seedSkills();
    const companies = await this.seedCompanies();
    await this.seedUsers(adminEmail, hashedPassword, companies);

    const seedUsers = await this.findSeedUsers(adminEmail);
    const jobs = await this.seedJobs(companies);
    const candidates = this.getSeedCandidates(seedUsers);
    const cvProfiles = await this.seedCvProfiles(candidates);

    await this.seedResumes(candidates, jobs, cvProfiles);
    await this.syncCandidateReferences(candidates, companies, jobs);

    this.logger.log('Seeding completed successfully');
  }

  private async seedSkills(): Promise<void> {
    const slugs = SKILLS_SEED_DATA.map(skill => skill.slug);
    const existingSkills = await this.skillModel.find({ slug: { $in: slugs } }, 'slug').lean();
    const existingSlugs = new Set(existingSkills.map(skill => skill.slug));
    const missingSkills = SKILLS_SEED_DATA.filter(skill => !existingSlugs.has(skill.slug));

    if (missingSkills.length === 0) {
      this.logger.log('Skills already seeded, skipping');
      return;
    }

    await this.skillModel.insertMany(missingSkills);
    this.logger.log(`Skills seeded: ${missingSkills.length} records`);
  }

  private async seedCompanies(): Promise<SeedCompanyDocument[]> {
    const names = COMPANIES_SEED_DATA.map(company => company.name);
    const existingCompanies = await this.companyModel.find({ name: { $in: names } }, 'name').lean();
    const existingNames = new Set(existingCompanies.map(company => company.name));
    const missingCompanies = COMPANIES_SEED_DATA.filter(
      company => !existingNames.has(company.name),
    );

    if (missingCompanies.length > 0) {
      await this.companyModel.insertMany(missingCompanies);
      this.logger.log(`Companies seeded: ${missingCompanies.length} records`);
    } else {
      this.logger.log('Companies already seeded, skipping');
    }

    return this.companyModel
      .find({ name: { $in: names } }, '_id name logo')
      .lean<SeedCompanyDocument[]>();
  }

  private async seedUsers(
    adminEmail: string,
    hashedPassword: string,
    companies: SeedCompanyDocument[],
  ): Promise<void> {
    const usersData = createUsersSeedData(adminEmail, hashedPassword, companies);
    const emails = usersData.map(user => user.email);
    const existingUsers = await this.userModel.find({ email: { $in: emails } }, 'email').lean();
    const existingEmails = new Set(existingUsers.map(user => user.email));
    const missingUsers = usersData.filter(user => !existingEmails.has(user.email));

    if (missingUsers.length === 0) {
      this.logger.log('Users already seeded, skipping');
      return;
    }

    await this.userModel.insertMany(missingUsers);
    this.logger.log(`Users seeded: ${missingUsers.length} records`);
  }

  private async findSeedUsers(adminEmail: string): Promise<SeedUserDocument[]> {
    const emails = getSeedUserEmails(adminEmail);

    return this.userModel
      .find({ email: { $in: emails } }, '_id name email role')
      .lean<SeedUserDocument[]>();
  }

  private async seedJobs(companies: SeedCompanyDocument[]): Promise<SeedJobDocument[]> {
    const jobsData = createJobsSeedData(companies);
    const existingJobs = await this.findExistingSeedJobs(jobsData);
    const existingJobKeys = new Set(existingJobs.map(job => this.getJobKey(job)));
    const missingJobs = jobsData.filter(job => !existingJobKeys.has(this.getJobKey(job)));

    if (missingJobs.length > 0) {
      await this.jobModel.insertMany(missingJobs);
      this.logger.log(`Jobs seeded: ${missingJobs.length} records`);
    } else {
      this.logger.log('Jobs already seeded, skipping');
    }

    return this.findExistingSeedJobs(jobsData);
  }

  private async findExistingSeedJobs(jobsData: JobSeed[]): Promise<SeedJobDocument[]> {
    const names = [...new Set(jobsData.map(job => job.name))];
    const companyIds = [...new Set(jobsData.map(job => job.company._id.toString()))].map(
      id => new Types.ObjectId(id),
    );

    const jobs = await this.jobModel
      .find(
        {
          name: { $in: names },
          'company._id': { $in: companyIds },
        },
        '_id name skills company',
      )
      .lean<SeedJobDocument[]>();
    const seedJobKeys = new Set(jobsData.map(job => this.getJobKey(job)));

    return jobs.filter(job => seedJobKeys.has(this.getJobKey(job)));
  }

  private async seedCvProfiles(candidates: CandidateUserRef[]): Promise<CvProfileSeed[]> {
    const cvProfilesData = createCvProfilesSeedData(candidates);
    const userIds = candidates.map(candidate => candidate._id);
    const existingProfiles = await this.cvProfileModel
      .find({ userId: { $in: userIds } }, 'userId')
      .lean();
    const existingUserIds = new Set(existingProfiles.map(profile => profile.userId.toString()));
    const missingProfiles = cvProfilesData.filter(
      profile => !existingUserIds.has(profile.userId.toString()),
    );

    if (missingProfiles.length > 0) {
      await this.cvProfileModel.insertMany(missingProfiles);
      this.logger.log(`CV profiles seeded: ${missingProfiles.length} records`);
    } else {
      this.logger.log('CV profiles already seeded, skipping');
    }

    return this.cvProfileModel.find({ userId: { $in: userIds } }).lean<CvProfileSeed[]>();
  }

  private async seedResumes(
    candidates: CandidateUserRef[],
    jobs: SeedJobDocument[],
    cvProfiles: CvProfileSeed[],
  ): Promise<void> {
    const resumesData = createResumesSeedData(candidates, jobs, cvProfiles);
    const existingResumes = await this.findExistingSeedResumes(resumesData);
    const existingResumeKeys = new Set(existingResumes.map(resume => this.getResumeKey(resume)));
    const missingResumes = resumesData.filter(
      resume => !existingResumeKeys.has(this.getResumeKey(resume)),
    );

    if (missingResumes.length === 0) {
      this.logger.log('Resumes already seeded, skipping');
      return;
    }

    await this.resumeModel.insertMany(missingResumes);
    this.logger.log(`Resumes seeded: ${missingResumes.length} records`);
  }

  private async findExistingSeedResumes(resumesData: ResumeSeed[]): Promise<ResumeSeed[]> {
    const userIds = [...new Set(resumesData.map(resume => resume.userId.toString()))].map(
      id => new Types.ObjectId(id),
    );
    const jobIds = [...new Set(resumesData.map(resume => resume.jobId.toString()))].map(
      id => new Types.ObjectId(id),
    );
    const seedResumeKeys = new Set(resumesData.map(resume => this.getResumeKey(resume)));
    const resumes = await this.resumeModel
      .find({ userId: { $in: userIds }, jobId: { $in: jobIds } }, 'userId jobId')
      .lean<ResumeSeed[]>();

    return resumes.filter(resume => seedResumeKeys.has(this.getResumeKey(resume)));
  }

  private async syncCandidateReferences(
    candidates: CandidateUserRef[],
    companies: SeedCompanyDocument[],
    jobs: SeedJobDocument[],
  ): Promise<void> {
    await Promise.all(
      candidates.map((candidate, index) => {
        const savedJobs = Array.from({ length: 3 }, (_, offset) => {
          const job = jobs[(index * 5 + offset * 11) % jobs.length];
          return job._id;
        });
        const followedCompanies = Array.from({ length: 2 }, (_, offset) => {
          const company = companies[(index + offset * 7) % companies.length];
          return company._id;
        });

        return this.userModel.updateOne(
          { _id: candidate._id, email: candidate.email },
          {
            $addToSet: {
              savedJobs: { $each: savedJobs },
              companyFollowed: { $each: followedCompanies },
            },
          },
        );
      }),
    );

    this.logger.log(
      `Candidate saved jobs and followed companies synced: ${candidates.length} users`,
    );
  }

  private getSeedCandidates(users: SeedUserDocument[]): CandidateUserRef[] {
    return users
      .filter(user => user.email.endsWith('@seed.local') && user.email.startsWith('candidate'))
      .sort((first, second) => first.email.localeCompare(second.email))
      .map(user => ({
        _id: user._id,
        name: user.name,
        email: user.email,
      }));
  }

  private getJobKey(job: Pick<JobSeed, 'company' | 'name'>): string {
    return `${job.company._id.toString()}:${job.name}`;
  }

  private getResumeKey(resume: Pick<ResumeSeed, 'jobId' | 'userId'>): string {
    return `${resume.userId.toString()}:${resume.jobId.toString()}`;
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
}
