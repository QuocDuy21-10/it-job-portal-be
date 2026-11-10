import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { getQueueToken } from '@nestjs/bullmq';
import { InjectConnection } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { Connection, ConnectionStates } from 'mongoose';
import { Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { REDIS_CLIENT } from 'src/redis/redis.constants';
import { ALL_QUEUES } from 'src/queues/queues.constants';

const QUEUE_STATES = ['waiting', 'active', 'delayed', 'failed'] as const;

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly logger = new Logger(MetricsService.name);
  private queues: Queue[] = [];

  // Own registry, not the prom-client global one, so test apps never share metrics.
  readonly registry = new Registry();

  readonly httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration by Express route pattern',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
    registers: [this.registry],
  });

  constructor(
    private readonly moduleRef: ModuleRef,
    @InjectConnection() private readonly connection: Connection,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    collectDefaultMetrics({ register: this.registry });

    const jobs = new Gauge({
      name: 'bullmq_jobs',
      help: 'BullMQ job count per queue and state, read at scrape time',
      labelNames: ['queue', 'state'] as const,
      registers: [this.registry],
      collect: async () => {
        jobs.reset();
        await Promise.all(
          this.queues.map(async queue => {
            try {
              const result = await queue.getJobCounts(...QUEUE_STATES);
              for (const state of QUEUE_STATES)
                jobs.set({ queue: queue.name, state }, result[state] ?? 0);
            } catch (error) {
              this.logger.warn(
                `Skipping job counts for queue ${queue.name}: ${(error as Error).message}`,
              );
            }
          }),
        );
      },
    });

    const dependencyUp = new Gauge({
      name: 'app_dependency_up',
      help: '1 when the backend connection to the dependency is ready (no ping per scrape)',
      labelNames: ['dependency'] as const,
      registers: [this.registry],
      collect: () => {
        dependencyUp.set(
          { dependency: 'mongodb' },
          this.connection.readyState === ConnectionStates.connected ? 1 : 0,
        );
        dependencyUp.set({ dependency: 'redis' }, this.redis.status === 'ready' ? 1 : 0);
      },
    });
  }

  // Queue providers live in QueuesModule and are not exported; every provider exists by onModuleInit.
  onModuleInit(): void {
    this.queues = ALL_QUEUES.map(name =>
      this.moduleRef.get<Queue>(getQueueToken(name), { strict: false }),
    );
  }
}
