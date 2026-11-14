const REQUIRED = [
  'MONGO_URL',
  'JWT_ACCESS_TOKEN_SECRET',
  'JWT_REFRESH_TOKEN_SECRET',
  'JWT_ACCESS_EXPIRES_IN',
  'JWT_REFRESH_EXPIRES_IN',
  'OTP_SECRET',
];
const REQUIRED_IN_PRODUCTION = ['FE_URL', 'CORS_ORIGINS'];
const SECRETS = ['JWT_ACCESS_TOKEN_SECRET', 'JWT_REFRESH_TOKEN_SECRET', 'OTP_SECRET'];
// `openssl rand -hex 32` (the documented way to generate them) yields 64 characters.
const MIN_SECRET_LENGTH = 32;

/** Fails fast at boot instead of at the first request that needs a missing key. */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const isProduction = config.NODE_ENV === 'production';
  const required = isProduction ? [...REQUIRED, ...REQUIRED_IN_PRODUCTION] : REQUIRED;
  const missing = required.filter(key => !config[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
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
