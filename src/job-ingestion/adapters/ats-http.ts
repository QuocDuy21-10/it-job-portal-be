import { UnrecoverableError } from 'bullmq';

const BOARD_TOKEN_PATTERN = /^[a-z0-9-]+$/;
const ATS_FETCH_TIMEOUT_MS = 15_000;

export const assertBoardToken = (token: string): string => {
  if (!BOARD_TOKEN_PATTERN.test(token)) {
    throw new UnrecoverableError(`Invalid ATS board token: ${token}`);
  }

  return token;
};

export const fetchAtsJson = async (url: string): Promise<any> => {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(ATS_FETCH_TIMEOUT_MS),
  });

  if (response.status === 404) {
    throw new UnrecoverableError(`ATS board not found: ${url}`);
  }

  if (!response.ok) {
    throw new Error(`ATS request failed with status ${response.status}: ${url}`);
  }

  return response.json();
};
