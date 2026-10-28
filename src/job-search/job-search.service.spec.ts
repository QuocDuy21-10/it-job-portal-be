import { BadRequestException, NotFoundException } from '@nestjs/common';
import { JobSearchService } from './job-search.service';

const EXTERNAL_ID = '6720a1b2c3d4e5f6a7b8c9d0';

const setup = ({
  facet = [{ items: [], total: [] }] as any[],
  externalDoc = null as Record<string, any> | null,
  hiddenKeys = [] as string[],
  sourceDoc = { displayPolicy: 'FULL' } as Record<string, any> | null,
} = {}) => {
  const jobModel = { aggregate: jest.fn().mockResolvedValue(facet) };
  const externalJobModel = {
    collection: { collectionName: 'external_jobs' },
    aggregate: jest.fn().mockResolvedValue(facet),
    findById: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(externalDoc) }),
    }),
  };
  const jobSourceModel = {
    distinct: jest.fn().mockResolvedValue(hiddenKeys),
    findOne: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(sourceDoc) }),
    }),
  };
  const service = new JobSearchService(
    jobModel as any,
    externalJobModel as any,
    jobSourceModel as any,
  );

  return { service, jobModel, externalJobModel, jobSourceModel };
};

const CREATED_AT = new Date('2026-10-01T00:00:00Z');
const buildDoc = (overrides: Record<string, any> = {}) => ({
  _id: EXTERNAL_ID,
  sourceKey: 'greenhouse-axon',
  title: 'Backend Engineer',
  companyName: 'Axon',
  location: 'Ho Chi Minh City',
  locationCode: 'ho-chi-minh',
  isRemote: false,
  skills: ['Go'],
  level: 'Senior',
  descriptionHtml: '<p>Hi</p>',
  salaryText: 'Negotiable',
  createdAt: CREATED_AT,
  sourceUrl: 'https://example.com/job',
  status: 'ACTIVE',
  ...overrides,
});

const facetStageOf = (pipeline: any[]) => pipeline.find(stage => stage.$facet).$facet;

describe('JobSearchService', () => {
  describe('search', () => {
    it('applies defaults when the query is empty', async () => {
      const { service, jobModel } = setup();

      await service.search({});

      const pipeline = jobModel.aggregate.mock.calls[0][0];
      expect(pipeline.some((stage: any) => stage.$unionWith)).toBe(true);
      expect(pipeline.find((stage: any) => stage.$sort).$sort).toEqual({ postedAt: -1, id: 1 });
      expect(facetStageOf(pipeline).items.slice(0, 2)).toEqual([{ $skip: 0 }, { $limit: 10 }]);
    });

    it('coerces string query values', async () => {
      const { service, jobModel } = setup();

      await service.search({ page: '2', limit: '5', salaryMin: '100' } as any);

      const pipeline = jobModel.aggregate.mock.calls[0][0];
      expect(facetStageOf(pipeline).items.slice(0, 2)).toEqual([{ $skip: 5 }, { $limit: 5 }]);
      expect(pipeline[0].$match.salary).toEqual({ $gte: 100 });
    });

    it('builds pagination meta from the facet total', async () => {
      const items = [{ id: 'a' }];
      const { service } = setup({ facet: [{ items, total: [{ count: 23 }] }] });

      await expect(service.search({ page: 1, limit: 10 })).resolves.toEqual({
        result: items,
        meta: { pagination: { current_page: 1, per_page: 10, total_pages: 3, total: 23 } },
      });
    });

    it('returns zero totals when nothing matches', async () => {
      const { service } = setup({ facet: [{ items: [], total: [] }] });

      const response = await service.search({});

      expect(response.meta.pagination).toEqual({
        current_page: 1,
        per_page: 10,
        total_pages: 0,
        total: 0,
      });
    });

    it('queries the external model for source=external', async () => {
      const { service, jobModel, externalJobModel } = setup();

      await service.search({ source: 'external' });

      expect(externalJobModel.aggregate).toHaveBeenCalled();
      expect(jobModel.aggregate).not.toHaveBeenCalled();
    });

    it('skips the database when external-only results are impossible', async () => {
      const { service, jobModel, externalJobModel } = setup();

      const response = await service.search({ source: 'external', salaryMin: 1 });

      expect(jobModel.aggregate).not.toHaveBeenCalled();
      expect(externalJobModel.aggregate).not.toHaveBeenCalled();
      expect(response.result).toEqual([]);
      expect(response.meta.pagination.total).toBe(0);
    });

    it('rejects salaryMin greater than salaryMax', async () => {
      const { service } = setup();

      await expect(service.search({ salaryMin: 20, salaryMax: 10 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('normalizes location aliases to catalog codes', async () => {
      const { service, jobModel } = setup();

      await service.search({ locationCode: 'hcm' });

      expect(jobModel.aggregate.mock.calls[0][0][0].$match.locationCode).toBe('ho-chi-minh');
    });

    it('excludes hidden sources from the external union', async () => {
      const { service, jobModel, jobSourceModel } = setup({ hiddenKeys: ['topdev'] });

      await service.search({});

      expect(jobSourceModel.distinct).toHaveBeenCalledWith('key', { displayPolicy: 'HIDDEN' });
      const union = jobModel.aggregate.mock.calls[0][0].find((stage: any) => stage.$unionWith);
      expect(union.$unionWith.pipeline[0].$match.sourceKey).toEqual({ $nin: ['topdev'] });
    });

    it('does not look up sources for internal-only searches', async () => {
      const { service, jobSourceModel } = setup();

      await service.search({ source: 'internal' });

      expect(jobSourceModel.distinct).not.toHaveBeenCalled();
    });

    it('treats a blank keyword as no keyword', async () => {
      const { service, jobModel } = setup();

      await service.search({ keyword: '   ' });

      expect(jobModel.aggregate.mock.calls[0][0][0].$match.$and).toBeUndefined();
    });
  });

  describe('findExternalJob', () => {
    it('rejects malformed ids', async () => {
      const { service } = setup();

      await expect(service.findExternalJob('not-an-id')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws NotFoundException when the job does not exist', async () => {
      const { service } = setup({ externalDoc: null });

      await expect(service.findExternalJob(EXTERNAL_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns closed jobs with their status and display policy', async () => {
      const { service, externalJobModel, jobSourceModel } = setup({
        externalDoc: buildDoc({ status: 'CLOSED' }),
      });

      await expect(service.findExternalJob(EXTERNAL_ID)).resolves.toEqual({
        id: EXTERNAL_ID,
        sourceKey: 'greenhouse-axon',
        title: 'Backend Engineer',
        companyName: 'Axon',
        location: 'Ho Chi Minh City',
        locationCode: 'ho-chi-minh',
        isRemote: false,
        skills: ['Go'],
        level: 'Senior',
        descriptionHtml: '<p>Hi</p>',
        salaryText: 'Negotiable',
        postedAt: CREATED_AT,
        sourceUrl: 'https://example.com/job',
        applyUrl: 'https://example.com/job',
        status: 'CLOSED',
        displayPolicy: 'FULL',
      });
      expect(externalJobModel.findById).toHaveBeenCalledWith(EXTERNAL_ID);
      expect(jobSourceModel.findOne).toHaveBeenCalledWith({ key: 'greenhouse-axon' });
    });

    it('hides jobs of HIDDEN sources', async () => {
      const { service } = setup({
        externalDoc: buildDoc(),
        sourceDoc: { displayPolicy: 'HIDDEN' },
      });

      await expect(service.findExternalJob(EXTERNAL_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each([
      ['LINK_ONLY', { displayPolicy: 'LINK_ONLY' }],
      ['missing', null],
    ])('withholds the description when the policy is %s', async (_label, sourceDoc) => {
      const { service } = setup({ externalDoc: buildDoc(), sourceDoc });

      const detail = await service.findExternalJob(EXTERNAL_ID);

      expect(detail.descriptionHtml).toBe('');
      expect(detail.displayPolicy).toBe('LINK_ONLY');
    });

    it('shows STALE jobs as ACTIVE and expired jobs as CLOSED', async () => {
      const stale = setup({ externalDoc: buildDoc({ status: 'STALE' }) });
      const expired = setup({
        externalDoc: buildDoc({ expiresAt: new Date('2000-01-01T00:00:00Z') }),
      });

      await expect(stale.service.findExternalJob(EXTERNAL_ID)).resolves.toEqual(
        expect.objectContaining({ status: 'ACTIVE' }),
      );
      await expect(expired.service.findExternalJob(EXTERNAL_ID)).resolves.toEqual(
        expect.objectContaining({ status: 'CLOSED' }),
      );
    });
  });
});
