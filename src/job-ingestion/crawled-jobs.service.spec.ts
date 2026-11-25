import { CrawledJobsService, buildCrawledJobFilter } from './crawled-jobs.service';
import { ECrawledJobState } from './enums/crawled-job-state.enum';

const IDS = ['6720a1b2c3d4e5f6a7b8c9d0'];

const setup = (modifiedCount = 1) => {
  const query: Record<string, jest.Mock> = { lean: jest.fn().mockResolvedValue([{ _id: 'a' }]) };
  for (const method of ['select', 'sort', 'skip', 'limit']) {
    query[method] = jest.fn().mockReturnValue(query);
  }
  const model = {
    find: jest.fn().mockReturnValue(query),
    countDocuments: jest.fn().mockResolvedValue(21),
    updateMany: jest.fn().mockResolvedValue({ modifiedCount }),
  };
  return { service: new CrawledJobsService(model as any), model, query };
};

describe('buildCrawledJobFilter', () => {
  it('limits the crawl date', () => {
    expect(buildCrawledJobFilter({ from: '2026-11-01T00:00:00.000Z' })).toEqual({
      createdAt: { $gte: new Date('2026-11-01T00:00:00.000Z') },
    });
  });

  it('puts each job in exactly one state', () => {
    expect(buildCrawledJobFilter({ state: ECrawledJobState.REMOVED })).toEqual({
      removedAt: { $ne: null },
    });
    expect(buildCrawledJobFilter({ state: ECrawledJobState.CLOSED })).toEqual({
      status: 'CLOSED',
      removedAt: null,
    });
  });

  it('matches the keyword literally in title and company', () => {
    const filter = buildCrawledJobFilter({ sourceKey: 'topdev', keyword: ' c++ ' });

    expect(filter.sourceKey).toBe('topdev');
    expect(filter.$or).toEqual([{ title: /c\+\+/i }, { companyName: /c\+\+/i }]);
  });

  it('has no condition without filters', () => {
    expect(buildCrawledJobFilter({})).toEqual({});
  });
});

describe('CrawledJobsService', () => {
  it('pages newest first without descriptions', async () => {
    const { service, query } = setup();

    const page = await service.findAll({ page: '2', limit: '20' });

    expect(query.sort).toHaveBeenCalledWith({ _id: -1 });
    expect(query.skip).toHaveBeenCalledWith(20);
    expect(query.select).toHaveBeenCalledWith('-descriptionHtml -contentHash');
    expect(page.meta.pagination).toEqual({
      current_page: 2,
      per_page: 20,
      total_pages: 2,
      total: 21,
    });
  });

  it('takes down only jobs that are not removed yet, so the first reason is kept', async () => {
    const { service, model } = setup();

    await expect(
      service.remove({ ids: IDS, reason: 'Khiếu nại' }, { _id: 'u1', email: 'a@b.c' } as any),
    ).resolves.toEqual({ modified: 1 });

    expect(model.updateMany).toHaveBeenCalledWith(
      { _id: { $in: IDS }, removedAt: null },
      {
        $set: {
          removedAt: expect.any(Date),
          removedBy: { _id: 'u1', email: 'a@b.c' },
          removeReason: 'Khiếu nại',
        },
      },
    );
  });

  it('restores removed jobs without touching their crawl status', async () => {
    const { service, model } = setup();

    await service.restore(IDS);

    expect(model.updateMany).toHaveBeenCalledWith(
      { _id: { $in: IDS }, removedAt: { $ne: null } },
      { $unset: { removedAt: 1, removedBy: 1, removeReason: 1 } },
    );
  });
});
