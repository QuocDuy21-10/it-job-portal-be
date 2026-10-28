import { readFileSync } from 'fs';
import { join } from 'path';
import { UnrecoverableError } from 'bullmq';
import { EJobSourceProvider } from '../enums/job-source-provider.enum';
import { LeverAdapter } from './lever.adapter';

const fixture = JSON.parse(readFileSync(join(__dirname, '__fixtures__/lever-board.json'), 'utf8'));

const mockFetch = (status: number, body: unknown) =>
  jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe('LeverAdapter', () => {
  const adapter = new LeverAdapter();

  afterEach(() => jest.restoreAllMocks());

  it('declares the Lever provider', () => {
    expect(adapter.provider).toBe(EJobSourceProvider.LEVER);
  });

  it('fetches postings in json mode and maps every posting', async () => {
    const fetchSpy = mockFetch(200, fixture);

    const { jobs, listedIds } = await adapter.fetchJobs('ninjavan');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.lever.co/v0/postings/ninjavan?mode=json',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(jobs).toHaveLength(2);
    expect(listedIds).toEqual([
      '6ed76ce8-4156-4b60-b120-403538bd66cd',
      '0b1c2d3e-0000-4000-8000-000000000002',
    ]);
    expect(jobs[0]).toEqual({
      externalId: '6ed76ce8-4156-4b60-b120-403538bd66cd',
      title: 'Software Engineer (Backend)',
      location: 'Ho Chi Minh City',
      country: 'VN',
      isRemoteHint: false,
      sourceUrl: 'https://jobs.lever.co/ninjavan/6ed76ce8-4156-4b60-b120-403538bd66cd',
      applyUrl: 'https://jobs.lever.co/ninjavan/6ed76ce8-4156-4b60-b120-403538bd66cd/apply',
      descriptionHtml:
        '<div>Work with <b>Go</b> services.</div>' +
        '<h3>Requirements</h3><ul><li>Kotlin</li><li>PostgreSQL</li></ul>' +
        '<div>Benefits apply.</div>',
      publishedAt: new Date(1786469891368),
    });
    expect(jobs[1].isRemoteHint).toBe(true);
  });

  it('throws UnrecoverableError when the site does not exist', async () => {
    mockFetch(404, { ok: false, error: 'Document not found' });

    await expect(adapter.fetchJobs('missing-site')).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('throws when the response is not an array', async () => {
    mockFetch(200, { ok: false });

    await expect(adapter.fetchJobs('ninjavan')).rejects.toThrow('Unexpected Lever response');
  });
});
