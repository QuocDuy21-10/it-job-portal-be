import request from 'supertest';
import { genSaltSync, hashSync } from 'bcryptjs';
import { Types } from 'mongoose';
import { ERole } from 'src/casl/enums/role.enum';
import { Company } from 'src/companies/schemas/company.schema';
import { CvProfile } from 'src/cv-profiles/schemas/cv-profile.schema';
import { EJobApprovalStatus } from 'src/jobs/enums/job-approval-status.enum';
import { EJobFormOfWork } from 'src/jobs/enums/job-form-of-work.enum';
import { EJobLevel } from 'src/jobs/enums/job-level.enum';
import { Job } from 'src/jobs/schemas/job.schema';
import { Skill } from 'src/skills/schemas/skill.schema';
import { User } from 'src/users/schemas/user.schema';
import { TestApp } from './test-app';

export const PASSWORD = 'E2e-password-1';
const DAY_MS = 24 * 60 * 60 * 1000;

export type UserKey = 'hrA' | 'hrB' | 'hrNoCompany' | 'admin' | 'c1' | 'c2';

export interface World {
  companyA: string;
  companyB: string;
  jobA: string;
  jobB: string;
  users: Record<UserKey, { _id: string; email: string }>;
}

export async function seedWorld(t: TestApp): Promise<World> {
  await t.model(Skill.name).create({
    label: 'NestJS',
    slug: 'nestjs',
    aliases: ['nest'],
    isActive: true,
    isDeleted: false,
  });

  const [companyA, companyB] = await t.model(Company.name).create([
    { name: 'Company A', address: 'HCM', description: 'Company A', isDeleted: false },
    { name: 'Company B', address: 'HN', description: 'Company B', isDeleted: false },
  ]);
  const snapshot = (c: any) => ({ _id: c._id, name: c.name, logo: null });

  const passwordHash = hashSync(PASSWORD, genSaltSync(4));
  const userSpecs: Array<[UserKey, ERole, any]> = [
    ['hrA', ERole.HR, snapshot(companyA)],
    ['hrB', ERole.HR, snapshot(companyB)],
    ['hrNoCompany', ERole.HR, undefined],
    ['admin', ERole.SUPER_ADMIN, undefined],
    ['c1', ERole.NORMAL_USER, undefined],
    ['c2', ERole.NORMAL_USER, undefined],
  ];
  const created = await t.model(User.name).create(
    userSpecs.map(([key, role, company]) => ({
      name: key,
      email: `${key.toLowerCase()}@e2e.test`,
      password: passwordHash,
      role,
      company,
      isActive: true,
      isDeleted: false,
    })),
  );
  const users = Object.fromEntries(
    userSpecs.map(([key], i) => [key, { _id: created[i]._id.toString(), email: created[i].email }]),
  ) as World['users'];

  const now = Date.now();
  const jobDoc = (company: any) => ({
    name: `Backend at ${company.name}`,
    skills: ['NestJS'],
    company: snapshot(company),
    location: 'TP. Hồ Chí Minh',
    locationCode: 'ho-chi-minh',
    salary: 1000,
    quantity: 1,
    level: EJobLevel.JUNIOR,
    formOfWork: EJobFormOfWork.FULL_TIME,
    description: 'e2e job',
    startDate: new Date(now - DAY_MS),
    endDate: new Date(now + 30 * DAY_MS),
    isActive: true,
    approvalStatus: EJobApprovalStatus.APPROVED,
    isDeleted: false,
  });
  const [jobA, jobB] = await t.model(Job.name).create([jobDoc(companyA), jobDoc(companyB)]);

  await t.model(CvProfile.name).create(
    (['c1', 'c2'] as const).map(key => ({
      userId: new Types.ObjectId(users[key]._id),
      personalInfo: { fullName: key, phone: '0900000000', email: users[key].email },
      skills: [{ id: 'skill-1', name: 'NestJS', level: 'Intermediate' }],
      isActive: true,
    })),
  );

  return {
    companyA: companyA._id.toString(),
    companyB: companyB._id.toString(),
    jobA: jobA._id.toString(),
    jobB: jobB._id.toString(),
    users,
  };
}

export async function login(server: any, email: string, password = PASSWORD) {
  const res = await request(server)
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(201);
  const cookies: string[] = [].concat(res.headers['set-cookie'] ?? []);
  const refreshCookie = cookies.find(c => c.startsWith('refresh_token='))?.split(';')[0];
  return {
    accessToken: res.body.data.access_token as string,
    refreshCookie: refreshCookie as string,
  };
}

export function createJobBody(companyId: string): Record<string, unknown> {
  return {
    name: 'E2E Backend Developer',
    skills: ['NestJS'],
    company: { _id: companyId },
    locationCode: 'ho-chi-minh',
    salary: 1000,
    quantity: 1,
    level: EJobLevel.JUNIOR,
    formOfWork: EJobFormOfWork.FULL_TIME,
    description: 'Created by e2e',
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + 30 * DAY_MS).toISOString(),
  };
}
