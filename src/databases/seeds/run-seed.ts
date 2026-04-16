import { NestFactory } from '@nestjs/core';
import { SeedModule } from './seed.module';
import { SeedService } from './seed.service';

const runSeed = async () => {
  const app = await NestFactory.create(SeedModule, {
    logger: ['log', 'warn', 'error'],
  });

  await app.get(SeedService).run();

  await app.close();
};

void runSeed().catch((err: Error) => {
  console.error('Seeding failed:', err.message);
  process.exit(1);
});
