// Runs before any test module loads. `??=` lets CI override; values set here win over a local .env.
const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  MONGO_URL: 'mongodb://root:123456@localhost:27017/my-job-portal-e2e?authSource=admin',
  REDIS_HOST: 'localhost',
  REDIS_PORT: '6379',
  REDIS_PASSWORD: '',
  REDIS_QUEUE_DB: '14',
  REDIS_CACHE_DB: '15',
  JWT_ACCESS_TOKEN_SECRET: 'e2e-access-secret',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_TOKEN_SECRET: 'e2e-refresh-secret',
  JWT_REFRESH_EXPIRES_IN: '7d',
  OTP_SECRET: 'e2e-otp-secret',
  GEMINI_API_KEY: 'e2e-fake-gemini-key',
  AI_GROQ_HISTORY_LIMIT: '6',
  AI_GROQ_MAX_INPUT_TOKENS: '6000',
  AI_GROQ_MAX_MATCHING_JOBS: '3',
  AI_GROQ_MAX_SEARCH_RESULTS: '3',
  AI_GROQ_MAX_COMPANY_ITEMS: '2',
  AI_GROQ_MAX_TOP_SKILLS: '5',
  AI_GROQ_MAX_TOP_COMPANIES: '5',
  AI_GROQ_MAX_SUMMARY_CHARS: '400',
  FE_URL: 'http://localhost:3000',
  CORS_ORIGINS: 'http://localhost:3000',
  LOG_LEVEL: 'silent',
  SENTRY_DSN: '',
  METRICS_PORT: '19464',
};
for (const [key, value] of Object.entries(defaults)) {
  process.env[key] ??= value;
}

// The suite deletes every document, so never point it at a real database.
const dbName = new URL(process.env.MONGO_URL as string).pathname.replace(/^\//, '');
if (!dbName.endsWith('-e2e')) {
  throw new Error(`Refusing to run e2e against database "${dbName}": name must end with "-e2e"`);
}
