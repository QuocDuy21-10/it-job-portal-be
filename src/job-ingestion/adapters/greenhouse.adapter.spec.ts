import { readFileSync } from 'fs';
import { join } from 'path';
import { UnrecoverableError } from 'bullmq';
import { EJobSourceProvider } from '../enums/job-source-provider.enum';
import { GreenhouseAdapter } from './greenhouse.adapter';

const fixture = JSON.parse(
  readFileSync(join(__dirname, '__fixtures__/greenhouse-board.json'), 'utf8'),
);

const mockFetch = (status: number, body: unknown) =>
  jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe('GreenhouseAdapter', () => {
  const adapter = new GreenhouseAdapter();

  afterEach(() => jest.restoreAllMocks());

  it('declares the Greenhouse provider', () => {
    expect(adapter.provider).toBe(EJobSourceProvider.GREENHOUSE);
  });

  it('fetches the board with content and maps every job', async () => {
    const fetchSpy = mockFetch(200, fixture);

    const jobs = await adapter.fetchJobs('axon');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://boards-api.greenhouse.io/v1/boards/axon/jobs?content=true',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(jobs).toHaveLength(3);
    expect(jobs[0]).toEqual({
      externalId: '7001',
      title: 'Backend Software Engineer',
      location: 'Ho Chi Minh City, Ho Chi Minh City, Vietnam',
      sourceUrl: 'https://job-boards.greenhouse.io/axon/jobs/7001',
      descriptionHtml:
        '<p>Build services with Node.js and MongoDB.</p><script>alert(1)</script>',
      publishedAt: new Date('2026-09-01T10:00:00-04:00'),
    });
    expect(jobs[1].publishedAt).toBeUndefined();
  });

  it('throws UnrecoverableError when the board does not exist', async () => {
    mockFetch(404, { status: 404, error: 'Not found' });

    await expect(adapter.fetchJobs('missing-board')).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('throws a retryable error on server errors', async () => {
    mockFetch(500, {});

    const error = await adapter.fetchJobs('axon').catch(caught => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(UnrecoverableError);
    expect(error.message).toContain('status 500');
  });

  it('throws when the response has no jobs array', async () => {
    mockFetch(200, { unexpected: true });

    await expect(adapter.fetchJobs('axon')).rejects.toThrow('Unexpected Greenhouse response');
  });

  it('rejects an invalid board token without calling fetch', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');

    await expect(adapter.fetchJobs('../evil')).rejects.toBeInstanceOf(UnrecoverableError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
