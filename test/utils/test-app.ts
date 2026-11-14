import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { getConnectionToken } from '@nestjs/mongoose';
import { ThrottlerGuard } from '@nestjs/throttler';
import { MailerService } from '@nestjs-modules/mailer';
import Redis from 'ioredis';
import { Connection, Model } from 'mongoose';
import { AppModule } from 'src/app.module';
import { configureApp } from 'src/app.setup';
import { GeminiService } from 'src/gemini/gemini.service';
import { GroqService } from 'src/groq/groq.service';

export interface TestApp {
  app: NestExpressApplication;
  server: any;
  model<T = any>(name: string): Model<T>;
  close(): Promise<void>;
}

/** Every method resolves undefined; `then` stays undefined so Nest never treats it as a promise. */
const inertService = () =>
  new Proxy(
    {},
    {
      get: (_target, prop) =>
        prop === 'then' ? undefined : jest.fn().mockResolvedValue(undefined),
    },
  );

async function flushQueueDb(): Promise<void> {
  const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_QUEUE_DB),
  });
  await redis.flushdb();
  await redis.quit();
}

export async function createTestApp(options: { throttle?: boolean } = {}): Promise<TestApp> {
  // Before boot, so BullMQ workers never see keys left by a previous run.
  await flushQueueDb();

  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(GeminiService)
    .useValue(inertService())
    .overrideProvider(GroqService)
    .useValue(inertService())
    .overrideProvider(MailerService)
    .useValue({ sendMail: jest.fn().mockResolvedValue(undefined) });
  if (!options.throttle) {
    // ThrottlerGuard is a provider behind APP_GUARD (useExisting), so it is replaced as a provider.
    builder = builder.overrideProvider(ThrottlerGuard).useValue({ canActivate: () => true });
  }
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();

  const connection = app.get<Connection>(getConnectionToken());
  await Promise.all(
    connection.modelNames().map(name =>
      connection
        .model(name)
        .syncIndexes()
        // shortcut: CvProfile declares userId twice (unique Prop + plain schema.index), which conflicts (code 85/86); drop once src dedupes it.
        .catch(err => {
          if (err?.code !== 85 && err?.code !== 86) throw err;
        }),
    ),
  );

  return {
    app,
    server: app.getHttpServer(),
    model: <T = any>(name: string) => connection.model<T>(name),
    close: () => app.close(),
  };
}
