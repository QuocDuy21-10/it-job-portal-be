import { UnrecoverableError } from 'bullmq';
import { ResponseTooLargeError, UnsafeUrlError, fetchAtsJson, safeFetch } from './ats-http';

const HOSTS = new Set(['topdev.vn']);
const redirectTo = (location: string, status = 302) =>
  new Response(null, { status, headers: { location } });

describe('ats-http', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('safeFetch', () => {
    it('returns status and body for an allowed https host', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('ok'));

      await expect(
        safeFetch('https://topdev.vn/a', {
          allowedHosts: HOSTS,
          maxBytes: 10,
          headers: { 'User-Agent': 'DevLinkBot/1.0' },
        }),
      ).resolves.toEqual({ status: 200, ok: true, text: 'ok' });
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://topdev.vn/a',
        expect.objectContaining({
          redirect: 'manual',
          headers: { 'User-Agent': 'DevLinkBot/1.0' },
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it('follows relative redirects that stay on an allowed host', async () => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(redirectTo('/b', 301))
        .mockResolvedValueOnce(new Response('done'));

      const response = await safeFetch('https://topdev.vn/a', {
        allowedHosts: HOSTS,
        maxBytes: 10,
      });

      expect(response.text).toBe('done');
      expect(String(fetchSpy.mock.calls[1][0])).toBe('https://topdev.vn/b');
    });

    it('refuses a redirect to another host', async () => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(redirectTo('https://169.254.169.254/latest/meta-data'));

      await expect(
        safeFetch('https://topdev.vn/a', { allowedHosts: HOSTS, maxBytes: 10 }),
      ).rejects.toBeInstanceOf(UnsafeUrlError);
    });

    it.each(['http://topdev.vn/a', 'https://evil.test/a', 'not a url'])(
      'refuses %s without fetching',
      async url => {
        const fetchSpy = jest.spyOn(global, 'fetch');

        await expect(safeFetch(url, { allowedHosts: HOSTS, maxBytes: 10 })).rejects.toBeInstanceOf(
          UnsafeUrlError,
        );
        expect(fetchSpy).not.toHaveBeenCalled();
      },
    );

    it('gives up after 3 redirects', async () => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockImplementation(async () => redirectTo('/loop'));

      await expect(
        safeFetch('https://topdev.vn/a', { allowedHosts: HOSTS, maxBytes: 10 }),
      ).rejects.toBeInstanceOf(UnsafeUrlError);
      expect(fetchSpy).toHaveBeenCalledTimes(4);
    });

    it('aborts bodies larger than maxBytes', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(new Response('x'.repeat(11)));

      await expect(
        safeFetch('https://topdev.vn/a', { allowedHosts: HOSTS, maxBytes: 10 }),
      ).rejects.toBeInstanceOf(ResponseTooLargeError);
    });
  });

  describe('fetchAtsJson', () => {
    it('parses JSON from the board host', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ jobs: [] })));

      await expect(fetchAtsJson('https://api.lever.co/v0/postings/x')).resolves.toEqual({
        jobs: [],
      });
    });

    it('pins requests to the host of the board URL', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(redirectTo('https://evil.test/'));

      await expect(fetchAtsJson('https://api.lever.co/v0/postings/x')).rejects.toBeInstanceOf(
        UnsafeUrlError,
      );
    });

    it('throws UnrecoverableError on 404', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 404 }));

      await expect(fetchAtsJson('https://api.lever.co/v0/postings/x')).rejects.toBeInstanceOf(
        UnrecoverableError,
      );
    });
  });
});
