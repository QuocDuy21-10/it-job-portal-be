// Must be imported before anything else: Sentry patches modules as they load.
import 'dotenv/config';
import * as Sentry from '@sentry/nestjs';

// No DSN (dev, tests) → the SDK stays disabled.
Sentry.init({
  dsn: process.env.SENTRY_DSN || undefined,
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
  // The SDK's defaults would send refresh-token cookies, Authorization headers, login/OTP bodies,
  // chat and CV text given to the AI providers, query data and stack variables to a third party.
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    stackFrameVariables: false,
  },
});
