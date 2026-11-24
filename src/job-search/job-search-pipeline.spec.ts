import { EExternalJobStatus } from 'src/job-ingestion/enums/external-job-status.enum';
import { EJobFormOfWork } from 'src/jobs/enums/job-form-of-work.enum';
import { EJobApprovalStatus } from 'src/jobs/enums/job-approval-status.enum';
import { INormalizedJobSearch } from './interfaces/job-search-item.interface';
import {
  buildExternalMatch,
  buildExternalStages,
  buildInternalMatch,
  buildInternalStages,
  buildJobSearchPlan,
  buildTailStages,
} from './job-search-pipeline';

const NOW = new Date('2026-10-28T00:00:00Z');
const EXTERNAL_COLLECTION = 'external_jobs';

const buildSearch = (overrides: Partial<INormalizedJobSearch> = {}): INormalizedJobSearch => ({
  source: 'all',
  sort: 'newest',
  page: 1,
  limit: 10,
  ...overrides,
});

const buildMatch = () => ({ marker: true });
const projectOf = (stages: any[]) => stages.find(stage => stage.$project).$project;

describe('job-search-pipeline', () => {
  describe('buildInternalStages', () => {
    it('always applies public visibility and excludes soft-deleted jobs', () => {
      const match = buildInternalMatch(buildSearch(), NOW);

      expect(match).toEqual({
        isActive: true,
        approvalStatus: EJobApprovalStatus.APPROVED,
        $or: [{ endDate: { $gte: NOW } }, { endDate: null }],
        isDeleted: { $ne: true },
      });
    });

    it('puts an escaped keyword regex in $and without replacing the visibility $or', () => {
      const match = buildInternalMatch(buildSearch({ keyword: 'c++' }), NOW);
      const keywordOr = match.$and[0].$or;

      expect(match.$or).toHaveLength(2);
      expect(keywordOr).toHaveLength(3);
      expect(keywordOr[0].name.source).toBe('c\\+\\+');
      expect(keywordOr[0].name.flags).toBe('i');
      expect(Object.keys(keywordOr[1])).toEqual(['skills']);
      expect(Object.keys(keywordOr[2])).toEqual(['company.name']);
    });

    it('applies equality filters and the salary range', () => {
      const match = buildInternalMatch(
        buildSearch({
          locationCode: 'ho-chi-minh',
          level: 'Senior',
          formOfWork: EJobFormOfWork.FULL_TIME,
          salaryMin: 10000000,
          salaryMax: 20000000,
        }),
        NOW,
      );

      expect(match.locationCode).toBe('ho-chi-minh');
      expect(match.level).toBe('Senior');
      expect(match.formOfWork).toBe(EJobFormOfWork.FULL_TIME);
      expect(match.salary).toEqual({ $gte: 10000000, $lte: 20000000 });
    });

    it('sets only the provided salary bound', () => {
      const match = buildInternalMatch(buildSearch({ salaryMin: 5 }), NOW);

      expect(match.salary).toEqual({ $gte: 5 });
    });

    it('projects internal jobs into the unified shape with literals', () => {
      const project = projectOf(buildInternalStages(buildSearch(), buildMatch()));

      expect(project).toEqual(
        expect.objectContaining({
          _id: 0,
          id: { $toString: '$_id' },
          sourceType: { $literal: 'INTERNAL' },
          title: '$name',
          companyName: '$company.name',
          companyLogo: '$company.logo',
          postedAt: '$createdAt',
          applyMode: { $literal: 'INTERNAL' },
          hasSalary: { $literal: 1 },
        }),
      );
    });

    it('matches one skill exactly and case-insensitively', () => {
      const match = buildInternalMatch(buildSearch({ skills: 'node.js' }), NOW);

      expect(match.skills.source).toBe('^node\\.js$');
      expect(match.skills.flags).toBe('i');
      expect(match.skills.test('Node.js')).toBe(true);
      expect(match.skills.test('NodeXjs')).toBe(false);
    });

    it('does not match a longer skill that starts the same', () => {
      const match = buildInternalMatch(buildSearch({ skills: 'Java' }), NOW);

      expect(match.skills.test('Java')).toBe(true);
      expect(match.skills.test('JavaScript')).toBe(false);
    });
  });

  describe('buildExternalStages', () => {
    it('returns visible, unexpired external jobs', () => {
      const match = buildExternalMatch(buildSearch(), NOW, []);

      expect(match).toEqual({
        status: { $in: [EExternalJobStatus.ACTIVE, EExternalJobStatus.STALE] },
        $and: [{ $or: [{ expiresAt: { $gt: NOW } }, { expiresAt: null }] }],
      });
    });

    it('excludes hidden sources', () => {
      const match = buildExternalMatch(buildSearch(), NOW, ['topdev']);

      expect(match.sourceKey).toEqual({ $nin: ['topdev'] });
    });

    it('matches keyword, location and level', () => {
      const match = buildExternalMatch(
        buildSearch({ keyword: 'backend', locationCode: 'ho-chi-minh', level: 'Senior' }),
        NOW,
        [],
      );

      expect(match.$and[0].$or).toHaveLength(2);
      expect(match.$and[1].$or.map((condition: object) => Object.keys(condition)[0])).toEqual([
        'title',
        'skills',
        'companyName',
      ]);
      expect(match.locationCode).toBe('ho-chi-minh');
      expect(match.level).toBe('Senior');
    });

    it('maps the Remote form of work to isRemote', () => {
      const match = buildExternalMatch(buildSearch({ formOfWork: EJobFormOfWork.REMOTE }), NOW, []);

      expect(match.isRemote).toBe(true);
    });

    it.each([
      [{ formOfWork: EJobFormOfWork.FULL_TIME }],
      [{ salaryMin: 10000000 }],
      [{ salaryMax: 20000000 }],
    ])('excludes external jobs for %j', overrides => {
      expect(buildExternalMatch(buildSearch(overrides), NOW, [])).toBeNull();
    });

    it('projects external jobs into the unified shape', () => {
      const project = projectOf(buildExternalStages(buildSearch(), buildMatch())[0]);

      expect(project).toEqual(
        expect.objectContaining({
          _id: 0,
          id: { $toString: '$_id' },
          sourceType: { $literal: 'EXTERNAL' },
          postedAt: { $ifNull: ['$publishedAt', '$createdAt'] },
          applyMode: { $literal: 'EXTERNAL_REDIRECT' },
          hasSalary: { $literal: 0 },
          salaryText: 1,
        }),
      );
    });

    it('matches one skill exactly on external jobs', () => {
      const match = buildExternalMatch(buildSearch({ skills: 'React' }), NOW, []);

      expect(match.skills.test('react')).toBe(true);
      expect(match.skills.test('React Native')).toBe(false);
    });
  });

  // Each branch sorts on stored fields and keeps page * limit rows, so the union never sorts everything.
  describe('top-k branches', () => {
    it.each([
      ['newest', { createdAt: -1, _id: 1 }],
      ['oldest', { createdAt: 1, _id: 1 }],
      ['salary_desc', { salary: -1, createdAt: -1, _id: 1 }],
      ['salary_asc', { salary: 1, createdAt: -1, _id: 1 }],
    ] as const)('limits internal jobs sorted %s before projecting them', (sort, expected) => {
      const stages = buildInternalStages(buildSearch({ sort, page: 3, limit: 5 }), buildMatch());

      expect(stages.slice(0, 3)).toEqual([
        { $match: { marker: true } },
        { $sort: expected },
        { $limit: 15 },
      ]);
      expect(Object.keys(stages[3])).toEqual(['$project']);
    });

    // postedAt is publishedAt, or createdAt when there is none: two branches keep both sorts on stored fields.
    it.each([
      ['newest', -1],
      ['oldest', 1],
      ['salary_desc', -1],
      ['salary_asc', -1],
    ] as const)('splits external jobs on publishedAt for %s', (sort, direction) => {
      const branches = buildExternalStages(buildSearch({ sort, page: 2, limit: 10 }), buildMatch());

      expect(branches.map(stages => stages.slice(0, 3))).toEqual([
        [
          { $match: { marker: true, publishedAt: { $ne: null } } },
          { $sort: { publishedAt: direction, _id: 1 } },
          { $limit: 20 },
        ],
        [
          { $match: { marker: true, publishedAt: null } },
          { $sort: { createdAt: direction, _id: 1 } },
          { $limit: 20 },
        ],
      ]);
    });
  });

  describe('buildTailStages', () => {
    it.each([
      ['newest', { postedAt: -1, id: 1 }],
      ['oldest', { postedAt: 1, id: 1 }],
      ['salary_desc', { hasSalary: -1, salary: -1, postedAt: -1, id: 1 }],
      ['salary_asc', { hasSalary: -1, salary: 1, postedAt: -1, id: 1 }],
    ] as const)('merges the branches sorted %s, then pages', (sort, expected) => {
      expect(buildTailStages(buildSearch({ sort, page: 3, limit: 5 }))).toEqual([
        { $sort: expected },
        { $skip: 10 },
        { $limit: 5 },
        { $project: { hasSalary: 0 } },
      ]);
    });
  });

  describe('buildJobSearchPlan', () => {
    const plan = (overrides: Partial<INormalizedJobSearch> = {}) =>
      buildJobSearchPlan(buildSearch(overrides), NOW, EXTERNAL_COLLECTION, []) as any;
    const unions = (pipeline: any[]) => pipeline.filter(stage => stage.$unionWith);
    const visibleStatuses = { $in: [EExternalJobStatus.ACTIVE, EExternalJobStatus.STALE] };

    it('unions internal jobs with both external branches and counts each collection once', () => {
      const { target, pipeline, internalMatch, externalMatch } = plan();

      expect(target).toBe('internal');
      expect(unions(pipeline).map(stage => stage.$unionWith.coll)).toEqual([
        EXTERNAL_COLLECTION,
        EXTERNAL_COLLECTION,
      ]);
      expect(internalMatch.isActive).toBe(true);
      expect(externalMatch.status).toEqual(visibleStatuses);
      expect(externalMatch).not.toHaveProperty('publishedAt');
    });

    it.each([[{ salaryMin: 1 }], [{ source: 'internal' as const }]])(
      'queries and counts only internal jobs for %j',
      overrides => {
        const { target, pipeline, externalMatch } = plan(overrides);

        expect(target).toBe('internal');
        expect(unions(pipeline)).toEqual([]);
        expect(externalMatch).toBeNull();
      },
    );

    it('queries and counts only the external collection for source=external', () => {
      const { target, pipeline, internalMatch, externalMatch } = plan({ source: 'external' });

      expect(target).toBe('external');
      expect(pipeline[0].$match.status).toEqual(visibleStatuses);
      expect(unions(pipeline)).toHaveLength(1);
      expect(internalMatch).toBeNull();
      expect(externalMatch.status).toEqual(visibleStatuses);
    });

    it('returns an empty plan for source=external with a salary filter', () => {
      expect(plan({ source: 'external', salaryMin: 1 })).toEqual({ target: 'empty' });
    });
  });

  describe('endDate exposure', () => {
    it('projects endDate for internal jobs only', () => {
      expect(projectOf(buildInternalStages(buildSearch(), buildMatch())).endDate).toBe(1);
      expect(
        projectOf(buildExternalStages(buildSearch(), buildMatch())[0]).endDate,
      ).toBeUndefined();
    });
  });
});
