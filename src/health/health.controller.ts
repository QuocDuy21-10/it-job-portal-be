import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
  MongooseHealthIndicator,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import Redis from 'ioredis';
import { REDIS_CLIENT } from 'src/redis/redis.constants';
import { Public } from 'src/utils/decorators/public.decorator';

@ApiTags('Health Check')
@Controller('health')
@Public()
@SkipThrottle()
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: MongooseHealthIndicator,
    private indicator: HealthIndicatorService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Health Check',
    description: 'Checks MongoDB and Redis connectivity. Used by Docker and uptime monitors.',
  })
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      async () => {
        const redis = this.indicator.check('redis');
        try {
          await this.redis.ping();
          return redis.up();
        } catch (error) {
          return redis.down((error as Error).message);
        }
      },
    ]);
  }
}
