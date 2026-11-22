import { validateEnv } from './env.validation';

const base = {
  MONGO_URL: 'mongodb://localhost/test',
  JWT_ACCESS_TOKEN_SECRET: 'a',
  JWT_REFRESH_TOKEN_SECRET: 'b',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  OTP_SECRET: 'c',
  GEMINI_API_KEY: 'g',
  AI_GROQ_HISTORY_LIMIT: '6',
  AI_GROQ_MAX_INPUT_TOKENS: '6000',
  AI_GROQ_MAX_MATCHING_JOBS: '3',
  AI_GROQ_MAX_SEARCH_RESULTS: '3',
  AI_GROQ_MAX_COMPANY_ITEMS: '2',
  AI_GROQ_MAX_TOP_SKILLS: '5',
  AI_GROQ_MAX_TOP_COMPANIES: '5',
  AI_GROQ_MAX_SUMMARY_CHARS: '400',
};

describe('validateEnv', () => {
  it('applies development defaults', () => {
    expect(validateEnv(base)).toMatchObject({
      PORT: '8081',
      NODE_ENV: 'development',
      FE_URL: 'http://localhost:3000',
    });
  });

  it('lists every missing required key', () => {
    expect(() => validateEnv({ ...base, MONGO_URL: '', OTP_SECRET: undefined })).toThrow(
      'MONGO_URL, OTP_SECRET',
    );
  });

  // These used to fail later, while Nest built AIService/GeminiService, after part of the app had started.
  it('requires the Gemini key and every AI_GROQ_* limit in every environment', () => {
    expect(() =>
      validateEnv({ ...base, GEMINI_API_KEY: '', AI_GROQ_HISTORY_LIMIT: undefined }),
    ).toThrow('GEMINI_API_KEY, AI_GROQ_HISTORY_LIMIT');
  });

  it('rejects an AI_GROQ_* limit that is not a positive integer', () => {
    expect(() => validateEnv({ ...base, AI_GROQ_MAX_TOP_SKILLS: '0' })).toThrow(
      'AI_GROQ_MAX_TOP_SKILLS',
    );
    expect(() => validateEnv({ ...base, AI_GROQ_MAX_INPUT_TOKENS: 'many' })).toThrow(
      'AI_GROQ_MAX_INPUT_TOKENS',
    );
  });

  it('requires FE_URL and CORS_ORIGINS in production', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow('FE_URL, CORS_ORIGINS');
  });

  it('accepts an empty or valid METRICS_PORT', () => {
    expect(() => validateEnv({ ...base, METRICS_PORT: '' })).not.toThrow();
    expect(() => validateEnv({ ...base, METRICS_PORT: '9464' })).not.toThrow();
  });

  it('rejects an invalid METRICS_PORT', () => {
    expect(() => validateEnv({ ...base, METRICS_PORT: 'abc' })).toThrow('METRICS_PORT');
    expect(() => validateEnv({ ...base, METRICS_PORT: '70000' })).toThrow('METRICS_PORT');
  });

  describe('secret strength in production', () => {
    const strong = (char: string) => char.repeat(32);
    const production = {
      ...base,
      NODE_ENV: 'production',
      FE_URL: 'https://example.com',
      CORS_ORIGINS: 'https://example.com',
      JWT_ACCESS_TOKEN_SECRET: strong('a'),
      JWT_REFRESH_TOKEN_SECRET: strong('b'),
      OTP_SECRET: strong('c'),
      GOOGLE_CLIENT_ID: 'client.apps.googleusercontent.com',
      TRUST_PROXY: '1',
      REDIS_PASSWORD: 'redis-password',
      SMTP_HOST: 'smtp.example.com',
      SMTP_EMAIL: 'mailer@example.com',
      SMTP_PASSWORD: 'smtp-password',
    };

    // Without GOOGLE_CLIENT_ID google-auth-library skips the audience check; without TRUST_PROXY the
    // throttler counts every request as coming from the reverse proxy.
    it('requires Google, proxy, Redis and SMTP settings in production', () => {
      const run = () =>
        validateEnv({
          ...production,
          GOOGLE_CLIENT_ID: '',
          TRUST_PROXY: undefined,
          SMTP_PASSWORD: '',
        });
      expect(run).toThrow('GOOGLE_CLIENT_ID, TRUST_PROXY, SMTP_PASSWORD');
    });

    it('accepts 32-character secrets', () => {
      expect(() => validateEnv(production)).not.toThrow();
    });

    it('rejects secrets shorter than 32 characters and names them without printing values', () => {
      const weak = 'x'.repeat(31);
      const run = () =>
        validateEnv({ ...production, JWT_REFRESH_TOKEN_SECRET: weak, OTP_SECRET: weak });
      expect(run).toThrow('JWT_REFRESH_TOKEN_SECRET, OTP_SECRET');
      expect(run).not.toThrow(weak);
    });

    it('rejects identical access and refresh secrets', () => {
      expect(() => validateEnv({ ...production, JWT_REFRESH_TOKEN_SECRET: strong('a') })).toThrow(
        'must differ',
      );
    });

    it('does not check secret strength outside production', () => {
      expect(() => validateEnv(base)).not.toThrow();
    });
  });
});
