import { NestFactory } from '@nestjs/core';

import { SeedModule } from './seed.module';
import { SeedProductionService } from './production/seed-production.service';

// Manual one-off: SEED_PRODUCTION_SAMPLE=yes npm run seed:production-sample
const runSeed = async () => {
  const app = await NestFactory.createApplicationContext(SeedModule, {
    logger: ['log', 'warn', 'error'],
  });

  await app.get(SeedProductionService).run();

  await app.close();
};

void runSeed().catch((err: Error) => {
  console.error('Production sample seeding failed:', err.message);
  process.exit(1);
});
