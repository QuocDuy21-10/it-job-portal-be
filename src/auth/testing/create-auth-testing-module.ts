import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { Type } from '@nestjs/common';
import { Provider } from '@nestjs/common/interfaces/modules/provider.interface';
import { REDIS_CLIENT } from 'src/redis/redis.module';
import { SessionsService } from 'src/sessions/sessions.service';
import { UsersService } from 'src/users/users.service';
import { AccountDeletionQueueService } from 'src/queues/services/account-deletion-queue.service';
import { MailService } from 'src/mail/mail.service';
import { jest } from '@jest/globals';

type OverrideKind = 'provider' | 'guard';
type AsyncMock<TArgs extends unknown[] = unknown[], TResult = unknown> = jest.MockedFunction<
  (...args: TArgs) => Promise<TResult>
>;
type SyncMock<TArgs extends unknown[] = unknown[], TResult = unknown> = jest.MockedFunction<
  (...args: TArgs) => TResult
>;

export interface AuthTestingOverride {
  token: any;
  type?: OverrideKind;
  useValue: any;
}

export interface CreateAuthTestingModuleOptions {
  controllers?: Type<any>[];
  providers?: Provider[];
  overrides?: AuthTestingOverride[];
}

export interface MockCacheManager {
  get: AsyncMock<[string], string | null | undefined>;
  set: AsyncMock<[string, unknown, number?], void>;
  del: AsyncMock<string[], void>;
}

export interface MockRedisPipeline {
  set: SyncMock<[string, string, ...unknown[]], MockRedisPipeline>;
  exec: AsyncMock<[], unknown[]>;
}

export interface MockRedisClient {
  get: AsyncMock<[string], string | null | undefined>;
  set: AsyncMock<[string, string], void>;
  del: AsyncMock<string[], void>;
  setex: AsyncMock<[string, number, string], void>;
  incr: AsyncMock<[string], number>;
  ttl: AsyncMock<[string], number>;
  pipeline: SyncMock<[], MockRedisPipeline>;
}

export interface AuthTestingModuleContext {
  module: TestingModule;
  usersService: jest.Mocked<UsersService>;
  jwtService: jest.Mocked<JwtService>;
  configService: jest.Mocked<ConfigService>;
  sessionsService: jest.Mocked<SessionsService>;
  accountDeletionQueueService: jest.Mocked<AccountDeletionQueueService>;
  mailService: jest.Mocked<MailService>;
  mailerService: { sendMail: AsyncMock<[unknown], unknown> };
  cacheManager: MockCacheManager;
  redisClient: MockRedisClient;
  redisPipeline: MockRedisPipeline;
}

function getProviderToken(provider: Provider): any {
  if (typeof provider === 'function') {
    return provider;
  }

  return (provider as any).provide;
}

export async function createAuthTestingModule(
  options: CreateAuthTestingModuleOptions = {},
): Promise<AuthTestingModuleContext> {
  const redisPipeline: MockRedisPipeline = {
    set: jest
      .fn<(...args: [string, string, ...unknown[]]) => MockRedisPipeline>()
      .mockReturnThis(),
    exec: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  };

  const cacheManager: MockCacheManager = {
    get: jest.fn<(key: string) => Promise<string | null | undefined>>(),
    set: jest.fn<(key: string, value: unknown, ttl?: number) => Promise<void>>(),
    del: jest.fn<(...keys: string[]) => Promise<void>>(),
  };

  const redisClient: MockRedisClient = {
    get: jest.fn<(key: string) => Promise<string | null | undefined>>(),
    set: jest.fn<(key: string, value: string) => Promise<void>>(),
    del: jest.fn<(...keys: string[]) => Promise<void>>(),
    setex: jest.fn<(key: string, ttl: number, value: string) => Promise<void>>(),
    incr: jest.fn<(key: string) => Promise<number>>(),
    ttl: jest.fn<(key: string) => Promise<number>>(),
    pipeline: jest.fn<() => MockRedisPipeline>(() => redisPipeline),
  };

  const mailerService = {
    sendMail: jest.fn<(payload: unknown) => Promise<unknown>>(),
  };

  const commonProviders: Provider[] = [
    {
      provide: UsersService,
      useValue: {
        findOneByUserEmail: jest.fn(),
        findUserByEmail: jest.fn(),
        findUserByGoogleId: jest.fn(),
        findOne: jest.fn(),
        findUserProfile: jest.fn(),
        isValidPassword: jest.fn(),
        linkGoogleAccount: jest.fn(),
        createGoogleUser: jest.fn(),
        register: jest.fn(),
        updateUnverifiedUser: jest.fn(),
        activateUser: jest.fn(),
        updatePassword: jest.fn(),
        scheduleAccountDeletion: jest.fn(),
        cancelAccountDeletion: jest.fn(),
        remove: jest.fn(),
      },
    },
    {
      provide: JwtService,
      useValue: {
        sign: jest.fn().mockReturnValue('mock-jwt-token'),
        verify: jest.fn(),
      },
    },
    {
      provide: ConfigService,
      useValue: {
        get: jest.fn((key: string) => {
          const config: Record<string, string> = {
            JWT_ACCESS_TOKEN_SECRET: 'access-secret',
            JWT_REFRESH_TOKEN_SECRET: 'refresh-secret',
            JWT_ACCESS_EXPIRES_IN: '7d',
            JWT_REFRESH_EXPIRES_IN: '30d',
            NODE_ENV: 'test',
            GOOGLE_CLIENT_ID: 'mock-google-client-id',
            OTP_SECRET: 'otp-secret',
            FE_URL: 'http://localhost:3000',
            FRONTEND_URL: 'http://localhost:3000',
          };

          return config[key];
        }),
      },
    },
    {
      provide: SessionsService,
      useValue: {
        createSession: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({}),
        enforceSessionLimit: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockResolvedValue({}),
        revokeSession: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({}),
        deleteSession: jest.fn<(...args: unknown[]) => Promise<boolean>>().mockResolvedValue(true),
        deleteAllUserSessions: jest
          .fn<(...args: unknown[]) => Promise<number>>()
          .mockResolvedValue(3),
        getActiveSessions: jest.fn(),
      },
    },
    { provide: CACHE_MANAGER, useValue: cacheManager },
    { provide: REDIS_CLIENT, useValue: redisClient },
    { provide: MailerService, useValue: mailerService },
    {
      provide: AccountDeletionQueueService,
      useValue: {
        addDeletionJob: jest
          .fn<(...args: unknown[]) => Promise<void>>()
          .mockResolvedValue(undefined),
        cancelDeletionJob: jest
          .fn<(...args: unknown[]) => Promise<void>>()
          .mockResolvedValue(undefined),
      },
    },
    {
      provide: MailService,
      useValue: {
        sendAccountDeletionScheduled: jest
          .fn<(...args: unknown[]) => Promise<void>>()
          .mockResolvedValue(undefined),
      },
    },
  ];

  const providedTokens = new Set((options.providers || []).map(getProviderToken));
  const providers = [
    ...commonProviders.filter(provider => !providedTokens.has(getProviderToken(provider))),
    ...(options.providers || []),
  ];

  const moduleBuilder = Test.createTestingModule({
    controllers: options.controllers || [],
    providers,
  });

  for (const override of options.overrides || []) {
    if (override.type === 'guard') {
      moduleBuilder.overrideGuard(override.token).useValue(override.useValue);
      continue;
    }

    moduleBuilder.overrideProvider(override.token).useValue(override.useValue);
  }

  const module = await moduleBuilder.compile();

  return {
    module,
    usersService: module.get(UsersService),
    jwtService: module.get(JwtService),
    configService: module.get(ConfigService),
    sessionsService: module.get(SessionsService),
    accountDeletionQueueService: module.get(AccountDeletionQueueService),
    mailService: module.get(MailService),
    mailerService,
    cacheManager,
    redisClient,
    redisPipeline,
  };
}
