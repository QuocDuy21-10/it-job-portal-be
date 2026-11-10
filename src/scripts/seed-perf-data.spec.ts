import { Types } from 'mongoose';
import { EExternalJobStatus } from '../job-ingestion/enums/external-job-status.enum';
import { EJobApprovalStatus } from '../jobs/enums/job-approval-status.enum';
import {
  buildPerfCompany,
  buildPerfExternalJob,
  buildPerfJob,
  createRng,
  PerfJob,
} from './seed-perf-data';

const now = new Date('2026-11-10T00:00:00Z');

// Mirrors buildPublicJobVisibilityFilter plus the soft-delete plugin condition.
const isPublic = (job: PerfJob) =>
  job.isActive &&
  job.approvalStatus === EJobApprovalStatus.APPROVED &&
  !job.isDeleted &&
  (job.endDate === null || job.endDate >= now);

describe('perf data generators', () => {
  const rng = createRng(42);
  const companies = Array.from({ length: 20 }, (_, i) => buildPerfCompany(rng, i, now));
  const jobs = Array.from({ length: 5_000 }, (_, i) => buildPerfJob(rng, i, companies, now));
  const externalJobs = Array.from({ length: 2_000 }, (_, i) =>
    buildPerfExternalJob(rng, i, ['source-a', 'source-b'], now),
  );

  it('createRng is deterministic for the same seed', () => {
    const a = createRng(7);
    const b = createRng(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('keeps about 60% of jobs publicly visible', () => {
    const ratio = jobs.filter(isPublic).length / jobs.length;
    expect(ratio).toBeGreaterThan(0.55);
    expect(ratio).toBeLessThan(0.65);
  });

  it('leaves about 20% of jobs without an endDate', () => {
    const ratio = jobs.filter(job => job.endDate === null).length / jobs.length;
    expect(ratio).toBeGreaterThan(0.15);
    expect(ratio).toBeLessThan(0.25);
  });

  it('embeds a company snapshot with an ObjectId', () => {
    expect(jobs.every(job => job.company._id instanceof Types.ObjectId)).toBe(true);
    expect(companies.map(c => String(c._id))).toEqual(
      expect.arrayContaining([String(jobs[0].company._id)]),
    );
  });

  it('gives external jobs unique externalIds and known statuses', () => {
    expect(new Set(externalJobs.map(job => job.externalId)).size).toBe(externalJobs.length);
    const statuses = new Set(externalJobs.map(job => job.status));
    expect([...statuses].every(s => Object.values(EExternalJobStatus).includes(s))).toBe(true);
    expect(statuses.has(EExternalJobStatus.CLOSED)).toBe(true);
  });
});
