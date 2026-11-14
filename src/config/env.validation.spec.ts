import { validateEnv } from './env.validation';

const base = {
  MONGO_URL: 'mongodb://localhost/test',
  JWT_ACCESS_TOKEN_SECRET: 'a',
  JWT_REFRESH_TOKEN_SECRET: 'b',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  OTP_SECRET: 'c',
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
    };

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
