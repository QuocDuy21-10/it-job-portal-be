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
});
