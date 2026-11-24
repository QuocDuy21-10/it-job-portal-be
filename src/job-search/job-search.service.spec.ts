import { BadRequestException, NotFoundException } from '@nestjs/common';
import { JOB_SEARCH_MAX_PAGE } from './job-search.constants';
import { JobSearchService } from './job-search.service';

const EXTERNAL_ID = '6720a1b2c3d4e5f6a7b8c9d0';

const setup = ({
  items = [] as any[],
  internalCount = 0,
  externalCount = 0,
  externalDoc = null as Record<string, any> | null,
  hiddenKeys = [] as string[],
  sourceDoc = { displayPolicy: 'FULL' } as Record<string, any> | null,
} = {}) => {
  // A count pipeline is [$match, $count]; anything else asks for the page.
  const aggregate = (count: number) =>
    jest.fn(async (pipeline: any[]) => (pipeline[1]?.$count ? (count ? [{ count }] : []) : items));
  const jobModel = { aggregate: aggregate(internalCount) };
  const externalJobModel = {
    collection: { collectionName: 'external_jobs' },
    aggregate: aggregate(externalCount),
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
  const listCacheService = {
    getOrSet: jest.fn((options: { loader: () => Promise<unknown> }) => options.loader()),
  };
  const service = new JobSearchService(
    jobModel as any,
    externalJobModel as any,
    jobSourceModel as any,
    listCacheService as any,
  );

  return { service, jobModel, externalJobModel, jobSourceModel, listCacheService };
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

const fullPage = (size: number) => Array.from({ length: size }, (_, i) => ({ id: String(i) }));
const pageCallsOf = (model: { aggregate: jest.Mock }): any[][] =>
  model.aggregate.mock.calls.map(([pipeline]) => pipeline).filter(stages => !stages[1]?.$count);

describe('JobSearchService', () => {
  describe('search', () => {
    it('applies defaults when the query is empty', async () => {
      const { service, jobModel } = setup();

      await service.search({});

      const pipeline = pageCallsOf(jobModel)[0];
      expect(pipeline.some((stage: any) => stage.$unionWith)).toBe(true);
      expect(pipeline.slice(-4, -1)).toEqual([
        { $sort: { postedAt: -1, id: 1 } },
        { $skip: 0 },
        { $limit: 10 },
      ]);
    });

    it('coerces string query values', async () => {
      const { service, jobModel } = setup();

      await service.search({ page: '2', limit: '5', salaryMin: '100' } as any);

      const pipeline = pageCallsOf(jobModel)[0];
      expect(pipeline.slice(-3, -1)).toEqual([{ $skip: 5 }, { $limit: 5 }]);
      expect(pipeline[0].$match.salary).toEqual({ $gte: 100 });
    });

    it('builds pagination meta from the internal and external counts', async () => {
      const items = fullPage(10);
      const { service } = setup({ items, internalCount: 20, externalCount: 3 });

      await expect(service.search({ page: 1, limit: 10 })).resolves.toEqual({
        result: items,
        meta: { pagination: { current_page: 1, per_page: 10, total_pages: 3, total: 23 } },
      });
    });

    it('returns zero totals when nothing matches', async () => {
      const { service } = setup();

      const response = await service.search({});

      expect(response.meta.pagination).toEqual({
        current_page: 1,
        per_page: 10,
        total_pages: 0,
        total: 0,
      });
    });

    it('caches the total under the filters only, so every page and sort shares it', async () => {
      const { service, listCacheService } = setup({ hiddenKeys: ['topdev'] });

      await service.search({ keyword: 'go', page: 2, sort: 'oldest' });
      await service.search({ keyword: 'go', page: 3, limit: 20 });
      await service.search({ keyword: 'rust', page: 2 });

      const [first, second, third] = listCacheService.getOrSet.mock.calls.map(
        ([options]) => (options as any).keyInput,
      );
      expect(first).toEqual(second);
      expect(first).not.toEqual(third);
      expect(first.payload.hiddenSourceKeys).toEqual(['topdev']);
    });

    // A rare keyword scans everything once to fill the page; counting would scan it all again.
    it('takes the total from a last page instead of counting', async () => {
      const { service, listCacheService } = setup({ items: fullPage(3), internalCount: 999 });

      const response = await service.search({ keyword: 'rare', page: 2, limit: 10 });

      expect(response.meta.pagination).toMatchObject({ total: 13, total_pages: 2 });
      expect(listCacheService.getOrSet).not.toHaveBeenCalled();
    });

    it('counts when a page past the end is empty', async () => {
      const { service } = setup({ internalCount: 7 });

      const response = await service.search({ page: 5, limit: 10 });

      expect(response.meta.pagination.total).toBe(7);
    });

    // The cached total can lag behind a job published in the last minute.
    it('never reports a total smaller than the rows already served', async () => {
      const { service } = setup({ items: fullPage(10), internalCount: 0 });

      const response = await service.search({ page: 2, limit: 10 });

      expect(response.meta.pagination.total).toBe(20);
    });

    it('does not advertise pages past the last one it accepts', async () => {
      const { service } = setup({ items: fullPage(10), internalCount: 1_000_000 });

      const response = await service.search({ limit: 10 });

      expect(response.meta.pagination.total_pages).toBe(JOB_SEARCH_MAX_PAGE);
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

    it('passes a trimmed skill to both pipelines and ignores a blank one', async () => {
      const { service, jobModel } = setup();

      await service.search({ skills: '  Go  ' });
      expect(pageCallsOf(jobModel)[0][0].$match.skills.test('go')).toBe(true);

      await service.search({ skills: '   ' });
      expect(pageCallsOf(jobModel)[1][0].$match.skills).toBeUndefined();
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

      expect(pageCallsOf(jobModel)[0][0].$match.locationCode).toBe('ho-chi-minh');
    });

    it('excludes hidden sources from the external union', async () => {
      const { service, jobModel, jobSourceModel } = setup({ hiddenKeys: ['topdev'] });

      await service.search({});

      expect(jobSourceModel.distinct).toHaveBeenCalledWith('key', { displayPolicy: 'HIDDEN' });
      const union = pageCallsOf(jobModel)[0].find((stage: any) => stage.$unionWith);
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

      expect(pageCallsOf(jobModel)[0][0].$match.$and).toBeUndefined();
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
