import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { hostname } from 'os';
import { CRON_LOCK_KEY_PREFIX, CRON_LOCK_TTL_MS, REDIS_CLIENT } from './redis.constants';

const MINUTE_MS = 60_000;

@Injectable()
export class CronLockService {
  private readonly logger = new Logger(CronLockService.name);
  private readonly owner = `${hostname()}:${process.pid}`;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async runExclusive(name: string, fn: () => Promise<unknown>): Promise<void> {
    // Rounding to the nearest minute tolerates a timer firing slightly early or up to 30s late.
    const slot = Math.round(Date.now() / MINUTE_MS);
    const key = `${CRON_LOCK_KEY_PREFIX}:${name}:${slot}`;

    let acquired: string | null;
    try {
      acquired = await this.redis.set(key, this.owner, 'PX', CRON_LOCK_TTL_MS, 'NX');
    } catch (error) {
      // Fail closed: a skipped run is safer than every instance sending the same emails.
      this.logger.error(
        `Skipping cron ${name}: lock unavailable (${error instanceof Error ? error.message : String(error)})`,
      );
      return;
    }

    if (acquired !== 'OK') {
      this.logger.debug(`Skipping cron ${name}: another instance holds ${key}`);
      return;
    }

    await fn();
  }
}
