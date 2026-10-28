// Must be imported before anything else: Sentry patches modules as they load.
import 'dotenv/config';
import * as Sentry from '@sentry/nestjs';

// No DSN (dev, tests) → the SDK stays disabled.
Sentry.init({
  dsn: process.env.SENTRY_DSN || undefined,
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
});
