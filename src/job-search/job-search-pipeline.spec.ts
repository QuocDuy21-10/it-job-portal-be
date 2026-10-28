import { EExternalJobStatus } from 'src/job-ingestion/enums/external-job-status.enum';
import { EJobFormOfWork } from 'src/jobs/enums/job-form-of-work.enum';
import { EJobApprovalStatus } from 'src/jobs/enums/job-approval-status.enum';
import { INormalizedJobSearch } from './interfaces/job-search-item.interface';
import {
  buildExternalStages,
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

const matchOf = (stages: any[]) => stages.find(stage => stage.$match).$match;
const projectOf = (stages: any[]) => stages.find(stage => stage.$project).$project;

describe('job-search-pipeline', () => {
  describe('buildInternalStages', () => {
    it('always applies public visibility and excludes soft-deleted jobs', () => {
      const match = matchOf(buildInternalStages(buildSearch(), NOW));

      expect(match).toEqual({
        isActive: true,
        approvalStatus: EJobApprovalStatus.APPROVED,
        $or: [{ endDate: { $gte: NOW } }, { endDate: null }],
        isDeleted: { $ne: true },
      });
    });

    it('puts an escaped keyword regex in $and without replacing the visibility $or', () => {
      const match = matchOf(buildInternalStages(buildSearch({ keyword: 'c++' }), NOW));
      const keywordOr = match.$and[0].$or;

      expect(match.$or).toHaveLength(2);
      expect(keywordOr).toHaveLength(3);
      expect(keywordOr[0].name.source).toBe('c\\+\\+');
      expect(keywordOr[0].name.flags).toBe('i');
      expect(Object.keys(keywordOr[1])).toEqual(['skills']);
      expect(Object.keys(keywordOr[2])).toEqual(['company.name']);
    });

    it('applies equality filters and the salary range', () => {
      const match = matchOf(
        buildInternalStages(
          buildSearch({
            locationCode: 'ho-chi-minh',
            level: 'Senior',
            formOfWork: EJobFormOfWork.FULL_TIME,
            salaryMin: 10000000,
            salaryMax: 20000000,
          }),
          NOW,
        ),
      );

      expect(match.locationCode).toBe('ho-chi-minh');
      expect(match.level).toBe('Senior');
      expect(match.formOfWork).toBe(EJobFormOfWork.FULL_TIME);
      expect(match.salary).toEqual({ $gte: 10000000, $lte: 20000000 });
    });

    it('sets only the provided salary bound', () => {
      const match = matchOf(buildInternalStages(buildSearch({ salaryMin: 5 }), NOW));

      expect(match.salary).toEqual({ $gte: 5 });
    });

    it('projects internal jobs into the unified shape with literals', () => {
      const project = projectOf(buildInternalStages(buildSearch(), NOW));

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
  });

  describe('buildExternalStages', () => {
    it('only returns active external jobs', () => {
      const match = matchOf(buildExternalStages(buildSearch()));

      expect(match).toEqual({ status: EExternalJobStatus.ACTIVE });
    });

    it('matches keyword, location and level', () => {
      const match = matchOf(
        buildExternalStages(
          buildSearch({ keyword: 'backend', locationCode: 'ho-chi-minh', level: 'Senior' }),
        ),
      );

      expect(match.$or.map((condition: object) => Object.keys(condition)[0])).toEqual([
        'title',
        'skills',
        'companyName',
      ]);
      expect(match.locationCode).toBe('ho-chi-minh');
      expect(match.level).toBe('Senior');
    });

    it('maps the Remote form of work to isRemote', () => {
      const match = matchOf(
        buildExternalStages(buildSearch({ formOfWork: EJobFormOfWork.REMOTE })),
      );

      expect(match.isRemote).toBe(true);
    });

    it.each([
      [{ formOfWork: EJobFormOfWork.FULL_TIME }],
      [{ salaryMin: 10000000 }],
      [{ salaryMax: 20000000 }],
    ])('excludes external jobs for %j', overrides => {
      expect(buildExternalStages(buildSearch(overrides))).toBeNull();
    });

    it('projects external jobs into the unified shape', () => {
      const project = projectOf(buildExternalStages(buildSearch()));

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
  });

  describe('buildTailStages', () => {
    it.each([
      ['newest', { postedAt: -1, id: 1 }],
      ['oldest', { postedAt: 1, id: 1 }],
      ['salary_desc', { hasSalary: -1, salary: -1, postedAt: -1, id: 1 }],
      ['salary_asc', { hasSalary: -1, salary: 1, postedAt: -1, id: 1 }],
    ] as const)('sorts %s as %j', (sort, expected) => {
      const [sortStage] = buildTailStages(buildSearch({ sort })) as any[];

      expect(sortStage.$sort).toEqual(expected);
    });

    it('paginates inside $facet and drops hasSalary', () => {
      const [, facetStage] = buildTailStages(buildSearch({ page: 3, limit: 5 })) as any[];

      expect(facetStage.$facet).toEqual({
        items: [{ $skip: 10 }, { $limit: 5 }, { $project: { hasSalary: 0 } }],
        total: [{ $count: 'count' }],
      });
    });
  });

  describe('buildJobSearchPlan', () => {
    const hasUnionWith = (pipeline: any[]) => pipeline.some(stage => stage.$unionWith);

    it('unions both collections for source=all', () => {
      const plan = buildJobSearchPlan(buildSearch(), NOW, EXTERNAL_COLLECTION) as any;
      const unionStage = plan.pipeline.find((stage: any) => stage.$unionWith);

      expect(plan.target).toBe('internal');
      expect(unionStage.$unionWith.coll).toBe(EXTERNAL_COLLECTION);
      expect(matchOf(unionStage.$unionWith.pipeline).status).toBe(EExternalJobStatus.ACTIVE);
    });

    it('skips the union when external jobs are excluded by filters', () => {
      const plan = buildJobSearchPlan(
        buildSearch({ salaryMin: 1 }),
        NOW,
        EXTERNAL_COLLECTION,
      ) as any;

      expect(plan.target).toBe('internal');
      expect(hasUnionWith(plan.pipeline)).toBe(false);
    });

    it('queries only internal jobs for source=internal', () => {
      const plan = buildJobSearchPlan(
        buildSearch({ source: 'internal' }),
        NOW,
        EXTERNAL_COLLECTION,
      ) as any;

      expect(plan.target).toBe('internal');
      expect(hasUnionWith(plan.pipeline)).toBe(false);
    });

    it('queries the external collection for source=external', () => {
      const plan = buildJobSearchPlan(
        buildSearch({ source: 'external' }),
        NOW,
        EXTERNAL_COLLECTION,
      ) as any;

      expect(plan.target).toBe('external');
      expect(matchOf(plan.pipeline).status).toBe(EExternalJobStatus.ACTIVE);
    });

    it('returns an empty plan for source=external with a salary filter', () => {
      expect(
        buildJobSearchPlan(
          buildSearch({ source: 'external', salaryMin: 1 }),
          NOW,
          EXTERNAL_COLLECTION,
        ),
      ).toEqual({ target: 'empty' });
    });

    it('ends every pipeline with $sort then $facet', () => {
      const plan = buildJobSearchPlan(buildSearch(), NOW, EXTERNAL_COLLECTION) as any;
      const lastTwo = plan.pipeline.slice(-2).map((stage: object) => Object.keys(stage)[0]);

      expect(lastTwo).toEqual(['$sort', '$facet']);
    });
  });

  describe('endDate exposure', () => {
    it('projects endDate for internal jobs only', () => {
      expect(projectOf(buildInternalStages(buildSearch(), NOW)).endDate).toBe(1);
      expect(projectOf(buildExternalStages(buildSearch())).endDate).toBeUndefined();
    });
  });
});
