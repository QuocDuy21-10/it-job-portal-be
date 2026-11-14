import { ConfigService } from '@nestjs/config';
import { ERole } from 'src/casl/enums/role.enum';
import { SeedService } from './seed.service';

const ADMIN_EMAIL = 'owner@example.com';
const baseEnv = {
  MONGO_URL: 'mongodb://localhost/test',
  EMAIL_ADMIN: ADMIN_EMAIL,
  INIT_PASSWORD: 'a-long-init-password',
};

// Every query finds nothing, so the seed treats the database as empty.
const createModel = () => ({
  find: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) })),
  insertMany: jest.fn().mockResolvedValue([]),
  bulkWrite: jest.fn().mockResolvedValue({ upsertedCount: 0, modifiedCount: 0 }),
  updateOne: jest.fn().mockResolvedValue({}),
});

function setup(env: Record<string, string | undefined>) {
  const models = {
    skill: createModel(),
    company: createModel(),
    user: createModel(),
    job: createModel(),
    cvProfile: createModel(),
    resume: createModel(),
    jobSource: createModel(),
  };
  const config = { get: jest.fn((key: string) => env[key]) } as unknown as ConfigService;
  const service = new SeedService(
    models.skill as any,
    models.company as any,
    models.user as any,
    models.job as any,
    models.cvProfile as any,
    models.resume as any,
    models.jobSource as any,
    config,
  );
  return { service, models };
}

describe('SeedService', () => {
  it.each([['production'], [undefined]])(
    'NODE_ENV=%s seeds only the real admin and reference data',
    async nodeEnv => {
      const { service, models } = setup({ ...baseEnv, NODE_ENV: nodeEnv });

      await service.run();

      expect(models.skill.insertMany).toHaveBeenCalled();
      expect(models.jobSource.bulkWrite).toHaveBeenCalled();
      expect(models.user.insertMany).toHaveBeenCalledTimes(1);
      const [users] = models.user.insertMany.mock.calls[0];
      expect(users).toHaveLength(1);
      expect(users[0]).toMatchObject({ email: ADMIN_EMAIL, role: ERole.SUPER_ADMIN });
      for (const model of [models.company, models.job, models.cvProfile, models.resume]) {
        expect(model.find).not.toHaveBeenCalled();
        expect(model.insertMany).not.toHaveBeenCalled();
      }
    },
  );

  it('refuses a short INIT_PASSWORD when sample data is off', async () => {
    const { service, models } = setup({
      ...baseEnv,
      NODE_ENV: 'production',
      INIT_PASSWORD: '123456',
    });

    await expect(service.run()).rejects.toThrow('INIT_PASSWORD');
    expect(models.user.insertMany).not.toHaveBeenCalled();
  });

  it('NODE_ENV=development still seeds sample companies and users', async () => {
    const { service, models } = setup({
      ...baseEnv,
      NODE_ENV: 'development',
      INIT_PASSWORD: '123456',
    });

    await service.run();

    expect(models.company.insertMany).toHaveBeenCalled();
    const [users] = models.user.insertMany.mock.calls[0];
    expect(users.length).toBeGreaterThan(1);
  });
});
