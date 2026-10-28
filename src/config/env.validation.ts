const REQUIRED = [
  'MONGO_URL',
  'JWT_ACCESS_TOKEN_SECRET',
  'JWT_REFRESH_TOKEN_SECRET',
  'JWT_ACCESS_EXPIRES_IN',
  'JWT_REFRESH_EXPIRES_IN',
  'OTP_SECRET',
];
const REQUIRED_IN_PRODUCTION = ['FE_URL', 'CORS_ORIGINS'];

/** Fails fast at boot instead of at the first request that needs a missing key. */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const isProduction = config.NODE_ENV === 'production';
  const required = isProduction ? [...REQUIRED, ...REQUIRED_IN_PRODUCTION] : REQUIRED;
  const missing = required.filter(key => !config[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  return { PORT: '8081', NODE_ENV: 'development', FE_URL: 'http://localhost:3000', ...config };
}
