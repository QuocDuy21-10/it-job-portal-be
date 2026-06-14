import { Types } from 'mongoose';

import { EJobApprovalStatus } from 'src/jobs/enums/job-approval-status.enum';
import { EResumeStatus } from 'src/resumes/enums/resume-status.enum';

import { createCvProfilesSeedData } from './cv-profiles.data';
import { createJobsSeedData } from './jobs.data';
import { createResumesSeedData } from './resumes.data';
import { createUsersSeedData } from './users.data';

const companies = Array.from({ length: 20 }, (_, index) => ({
  _id: new Types.ObjectId(),
  name: `Company ${index + 1}`,
  logo: null,
}));

describe('seed data builders', () => {
  it('creates the planned user mix', () => {
    const users = createUsersSeedData('admin@example.com', 'hashed-password', companies);

    expect(users).toHaveLength(100);
    expect(users.filter(user => user.role === 'SUPER ADMIN')).toHaveLength(5);
    expect(users.filter(user => user.role === 'HR')).toHaveLength(20);
    expect(users.filter(user => user.role === 'NORMAL USER')).toHaveLength(75);
    expect(new Set(users.map(user => user.email)).size).toBe(100);
    expect(users.filter(user => user.role === 'HR').every(user => Boolean(user.company?._id))).toBe(
      true,
    );
  });

  it('creates ten jobs per company with all dashboard states represented', () => {
    const jobs = createJobsSeedData(companies);

    expect(jobs).toHaveLength(200);
    expect(new Set(jobs.map(job => `${job.company._id.toString()}:${job.name}`)).size).toBe(200);
    expect(
      jobs.filter(job => job.approvalStatus === EJobApprovalStatus.APPROVED && job.isActive),
    ).toHaveLength(150);
    expect(jobs.filter(job => job.approvalStatus === EJobApprovalStatus.PENDING)).toHaveLength(20);
    expect(jobs.filter(job => job.approvalStatus === EJobApprovalStatus.REJECTED)).toHaveLength(10);
    expect(
      jobs.filter(job => job.approvalStatus === EJobApprovalStatus.APPROVED && !job.isActive),
    ).toHaveLength(20);
  });

  it('creates candidate CV profiles and unique resume applications', () => {
    const users = createUsersSeedData('admin@example.com', 'hashed-password', companies);
    const candidates = users
      .filter(user => user.email.startsWith('candidate'))
      .map(user => ({
        _id: new Types.ObjectId(),
        name: user.name,
        email: user.email,
      }));
    const jobs = createJobsSeedData(companies).map(job => ({
      _id: new Types.ObjectId(),
      name: job.name,
      skills: job.skills,
      company: job.company,
    }));
    const cvProfiles = createCvProfilesSeedData(candidates);
    const resumes = createResumesSeedData(candidates, jobs, cvProfiles);

    expect(cvProfiles).toHaveLength(75);
    expect(resumes).toHaveLength(300);
    expect(
      new Set(resumes.map(resume => `${resume.userId.toString()}:${resume.jobId.toString()}`)).size,
    ).toBe(300);
    expect(new Set(resumes.map(resume => resume.status))).toEqual(
      new Set([
        EResumeStatus.PENDING,
        EResumeStatus.REVIEWING,
        EResumeStatus.INTERVIEWING,
        EResumeStatus.APPROVED,
        EResumeStatus.REJECTED,
      ]),
    );
    expect(resumes.some(resume => resume.parseError)).toBe(true);
    expect(resumes.some(resume => resume.analysisError)).toBe(true);
    expect(resumes.some(resume => resume.aiAnalysis?.matchingScore)).toBe(true);
  });
});
