import { existsSync } from 'fs';
import { join } from 'path';

import { Types } from 'mongoose';

import { SKILLS_SEED_DATA } from '../data/skills.data';
import { PRODUCTION_CANDIDATES } from './candidates.production';
import { PRODUCTION_COMPANIES } from './companies.production';
import { createProductionJobs } from './jobs.production';

const companies = PRODUCTION_COMPANIES.map(company => ({
  _id: new Types.ObjectId(),
  slug: company.slug,
  name: company.name,
  logo: `${company.slug}.png`,
  tier: 1,
  city: company.city,
  sector: company.sector,
}));
const actor = { _id: new Types.ObjectId(), email: 'x@example.com' };
const jobs = createProductionJobs(companies, new Map(), actor);

describe('production sample data', () => {
  it('ships a logo file for every company', () => {
    for (const company of PRODUCTION_COMPANIES) {
      expect(existsSync(join(__dirname, 'logos', `${company.slug}.png`))).toBe(true);
    }
  });

  it('only uses skills that exist in the skill catalog', () => {
    const known = new Set(SKILLS_SEED_DATA.map(skill => skill.label));
    const unknown = new Set(jobs.flatMap(job => job.skills).filter(skill => !known.has(skill)));

    expect([...unknown]).toEqual([]);
  });

  it('has unique company names, candidate emails and job names per company', () => {
    expect(new Set(PRODUCTION_COMPANIES.map(c => c.name)).size).toBe(PRODUCTION_COMPANIES.length);
    expect(new Set(PRODUCTION_CANDIDATES.map(c => c.email)).size).toBe(
      PRODUCTION_CANDIDATES.length,
    );
    expect(new Set(jobs.map(j => `${j.company._id}:${j.name}`)).size).toBe(jobs.length);
  });

  it('produces realistic monthly VND salaries', () => {
    for (const job of jobs) {
      expect(job.salary).toBeGreaterThanOrEqual(10_000_000);
      expect(job.salary).toBeLessThanOrEqual(250_000_000);
    }
  });
});
