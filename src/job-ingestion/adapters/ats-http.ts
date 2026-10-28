import { UnrecoverableError } from 'bullmq';
import { FETCH_TIMEOUT_MS, MAX_BOARD_BYTES, MAX_REDIRECTS } from '../job-ingestion.constants';

const BOARD_TOKEN_PATTERN = /^[a-z0-9-]+$/;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export class UnsafeUrlError extends Error {}
export class ResponseTooLargeError extends Error {}

export interface ISafeFetchOptions {
  allowedHosts: ReadonlySet<string>;
  maxBytes: number;
  headers?: Record<string, string>;
}

export interface ISafeFetchResponse {
  status: number;
  ok: boolean;
  text: string;
}

export const assertBoardToken = (token: string): string => {
  if (!BOARD_TOKEN_PATTERN.test(token)) {
    throw new UnrecoverableError(`Invalid ATS board token: ${token}`);
  }

  return token;
};

const assertAllowedUrl = (url: string, allowedHosts: ReadonlySet<string>): void => {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new UnsafeUrlError(`Invalid URL: ${url}`);
  }

  if (parsed.protocol !== 'https:' || !allowedHosts.has(parsed.hostname)) {
    throw new UnsafeUrlError(`URL not allowed: ${url}`);
  }
};

const readLimited = async (response: Response, maxBytes: number): Promise<string> => {
  if (!response.body) {
    return '';
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    size += value.byteLength;

    if (size > maxBytes) {
      await reader.cancel();
      throw new ResponseTooLargeError(`Response exceeds ${maxBytes} bytes`);
    }

    chunks.push(value);
  }

  return Buffer.concat(chunks).toString('utf8');
};

// Redirects are followed by hand so every hop is checked against the allowlist.
export const safeFetch = async (
  url: string,
  { allowedHosts, maxBytes, headers }: ISafeFetchOptions,
): Promise<ISafeFetchResponse> => {
  let current = url;

  for (let redirects = 0; ; redirects++) {
    assertAllowedUrl(current, allowedHosts);

    const response = await fetch(current, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const location = response.headers.get('location');

    if (!REDIRECT_STATUSES.has(response.status) || !location) {
      return {
        status: response.status,
        ok: response.ok,
        text: await readLimited(response, maxBytes),
      };
    }

    await response.body?.cancel();

    if (redirects >= MAX_REDIRECTS) {
      throw new UnsafeUrlError(`Too many redirects: ${url}`);
    }

    current = new URL(location, current).toString();
  }
};

export const fetchAtsJson = async (url: string): Promise<any> => {
  const response = await safeFetch(url, {
    allowedHosts: new Set([new URL(url).hostname]),
    maxBytes: MAX_BOARD_BYTES,
    headers: { Accept: 'application/json' },
  });

  if (response.status === 404) {
    throw new UnrecoverableError(`ATS board not found: ${url}`);
  }

  if (!response.ok) {
    throw new Error(`ATS request failed with status ${response.status}: ${url}`);
  }

  return JSON.parse(response.text);
};
