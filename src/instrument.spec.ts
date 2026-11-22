jest.mock('dotenv/config', () => ({}));
jest.mock('@sentry/nestjs', () => ({ init: jest.fn() }));

import * as Sentry from '@sentry/nestjs';
import './instrument';

describe('Sentry init', () => {
  // SDK 11 collects these by default: refresh-token cookies, Authorization headers, login/OTP bodies,
  // chat and CV text sent to the AI providers, query data and stack variables.
  it('keeps credentials and personal data out of error reports', () => {
    const options = (Sentry.init as jest.Mock).mock.calls[0][0];

    expect(options.dataCollection).toEqual(
      expect.objectContaining({
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        genAI: { inputs: false, outputs: false },
        databaseQueryData: false,
        stackFrameVariables: false,
      }),
    );
  });
});
