import { NestExpressApplication } from '@nestjs/platform-express';
import { getConnectionToken } from '@nestjs/mongoose';
import Redis from 'ioredis';
import { Connection } from 'mongoose';
import { REDIS_CLIENT } from 'src/redis/redis.constants';

/** deleteMany instead of drop: dropping a collection also drops its indexes (the 409 test needs them). */
export async function resetState(app: NestExpressApplication): Promise<void> {
  const connection = app.get<Connection>(getConnectionToken());
  await Promise.all(Object.values(connection.collections).map(c => c.deleteMany({})));
  // REDIS_CLIENT points at REDIS_CACHE_DB: list cache, cache-manager and throttler share it.
  await app.get<Redis>(REDIS_CLIENT).flushdb();
}
