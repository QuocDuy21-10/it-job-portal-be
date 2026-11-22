const REQUIRED = [
  'MONGO_URL',
  'JWT_ACCESS_TOKEN_SECRET',
  'JWT_REFRESH_TOKEN_SECRET',
  'JWT_ACCESS_EXPIRES_IN',
  'JWT_REFRESH_EXPIRES_IN',
  'OTP_SECRET',
  'GEMINI_API_KEY',
];
// Read as positive integers by AIService; checked here so a bad value stops boot before anything runs.
const POSITIVE_INTS = [
  'AI_GROQ_HISTORY_LIMIT',
  'AI_GROQ_MAX_INPUT_TOKENS',
  'AI_GROQ_MAX_MATCHING_JOBS',
  'AI_GROQ_MAX_SEARCH_RESULTS',
  'AI_GROQ_MAX_COMPANY_ITEMS',
  'AI_GROQ_MAX_TOP_SKILLS',
  'AI_GROQ_MAX_TOP_COMPANIES',
  'AI_GROQ_MAX_SUMMARY_CHARS',
];
// GOOGLE_CLIENT_ID: without it google-auth-library skips the ID token audience check.
// TRUST_PROXY: without it the throttler sees every request as coming from the reverse proxy.
const REQUIRED_IN_PRODUCTION = [
  'FE_URL',
  'CORS_ORIGINS',
  'GOOGLE_CLIENT_ID',
  'TRUST_PROXY',
  'REDIS_PASSWORD',
  'SMTP_HOST',
  'SMTP_EMAIL',
  'SMTP_PASSWORD',
];
const SECRETS = ['JWT_ACCESS_TOKEN_SECRET', 'JWT_REFRESH_TOKEN_SECRET', 'OTP_SECRET'];
// `openssl rand -hex 32` (the documented way to generate them) yields 64 characters.
const MIN_SECRET_LENGTH = 32;

/** Fails fast at boot instead of at the first request that needs a missing key. */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const isProduction = config.NODE_ENV === 'production';
  const required = [...REQUIRED, ...POSITIVE_INTS, ...(isProduction ? REQUIRED_IN_PRODUCTION : [])];
  const missing = required.filter(key => !config[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  const notPositive = POSITIVE_INTS.filter(key => !(Number.parseInt(String(config[key]), 10) > 0));
  if (notPositive.length > 0) {
    throw new Error(`Must be positive integers: ${notPositive.join(', ')}`);
  }
  if (isProduction) {
    const weak = SECRETS.filter(key => String(config[key]).length < MIN_SECRET_LENGTH);
    if (weak.length > 0) {
      throw new Error(
        `Secrets must be at least ${MIN_SECRET_LENGTH} characters in production: ${weak.join(', ')}`,
      );
    }
    if (config.JWT_ACCESS_TOKEN_SECRET === config.JWT_REFRESH_TOKEN_SECRET) {
      throw new Error(
        'JWT_ACCESS_TOKEN_SECRET and JWT_REFRESH_TOKEN_SECRET must differ in production',
      );
    }
  }
  const metricsPort = config.METRICS_PORT;
  if (metricsPort !== undefined && metricsPort !== '') {
    const port = Number(metricsPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`METRICS_PORT must be an integer between 1 and 65535, got "${metricsPort}"`);
    }
  }
  return { PORT: '8081', NODE_ENV: 'development', FE_URL: 'http://localhost:3000', ...config };
}
