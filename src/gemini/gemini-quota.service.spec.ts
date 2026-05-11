import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { REDIS_CLIENT } from 'src/redis/redis.module';
import { GeminiQuotaDeniedException } from './gemini-quota-denied.exception';
import { GeminiQuotaService } from './gemini-quota.service';

describe('GeminiQuotaService', () => {
  const createTestingModule = async (
    evalMock: jest.Mock,
    setMock: jest.Mock,
    configValues: Record<string, string | undefined> = {},
  ) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeminiQuotaService,
        {
          provide: REDIS_CLIENT,
          useValue: {
            eval: evalMock,
            set: setMock,
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => configValues[key]),
          },
        },
      ],
    }).compile();

    return module.get<GeminiQuotaService>(GeminiQuotaService);
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reserves quota successfully', async () => {
    const evalMock = jest.fn().mockResolvedValue([1, 'ok', 1, 25, 0]);
    const setMock = jest.fn().mockResolvedValue('OK');
    const service = await createTestingModule(evalMock, setMock);

    await expect(service.reserveRequest('parse')).resolves.toEqual({
      minuteCount: 1,
      dayCount: 25,
      remainingMinuteQuota: 14,
      remainingDayQuota: 425,
    });
  });

  it('throws a minute-scope quota exception with retry metadata', async () => {
    const evalMock = jest.fn().mockResolvedValue([0, 'minute', 13, 100, 4200]);
    const setMock = jest.fn();
    const service = await createTestingModule(evalMock, setMock);

    await expect(service.reserveRequest('chat-fallback')).rejects.toEqual(
      expect.objectContaining({
        workload: 'chat-fallback',
        scope: 'minute',
        retryAfterMs: 4200,
        remainingMinuteQuota: 2,
        remainingDayQuota: 350,
      }),
    );
  });

  it('throws a day-scope quota exception with retry metadata', async () => {
    const evalMock = jest.fn().mockResolvedValue([0, 'day', 3, 430, 60000]);
    const setMock = jest.fn();
    const service = await createTestingModule(evalMock, setMock);

    await expect(service.reserveRequest('summary')).rejects.toBeInstanceOf(
      GeminiQuotaDeniedException,
    );
    await expect(service.reserveRequest('summary')).rejects.toEqual(
      expect.objectContaining({
        workload: 'summary',
        scope: 'day',
        retryAfterMs: 60000,
        remainingMinuteQuota: 12,
        remainingDayQuota: 20,
      }),
    );
  });

  it('passes workload reserve floors into the Redis reservation script', async () => {
    const evalMock = jest.fn().mockResolvedValue([1, 'ok', 1, 1, 0]);
    const setMock = jest.fn();
    const service = await createTestingModule(evalMock, setMock);

    await service.reserveRequest('summary');

    expect(evalMock).toHaveBeenCalledWith(
      expect.any(String),
      2,
      expect.stringContaining('gemini:quota:minute:'),
      expect.stringContaining('gemini:quota:day:'),
      '15',
      '450',
      '4',
      '50',
      '1',
      expect.any(String),
      expect.any(String),
    );
  });

  it('deduplicates daily threshold logs through Redis NX markers', async () => {
    const evalMock = jest
      .fn()
      .mockResolvedValueOnce([1, 'ok', 1, 85, 0])
      .mockResolvedValueOnce([1, 'ok', 2, 90, 0]);
    const setMock = jest
      .fn()
      .mockResolvedValueOnce('OK')
      .mockResolvedValueOnce('OK')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const service = await createTestingModule(evalMock, setMock, {
      GEMINI_DAILY_BUDGET: '100',
      GEMINI_DAILY_ALERT_THRESHOLDS: '70,85',
    });

    await service.reserveRequest('parse');
    await service.reserveRequest('parse');

    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid reserve configuration on startup', async () => {
    const evalMock = jest.fn();
    const setMock = jest.fn();

    await expect(
      createTestingModule(evalMock, setMock, {
        GEMINI_SUMMARY_MINUTE_RESERVE: '15',
      }),
    ).rejects.toThrow('GEMINI_SUMMARY_MINUTE_RESERVE must be an integer between 0 and 14');
  });
});
