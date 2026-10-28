import { NotFoundException } from '@nestjs/common';
import { EJobSourceDisplayPolicy } from './enums/job-source-display-policy.enum';
import { JobIngestionService } from './job-ingestion.service';

const SOURCE = { key: 'topdev', displayPolicy: EJobSourceDisplayPolicy.LINK_ONLY, enabled: true };

const setup = () => {
  const jobSourceModel = { find: jest.fn(), exists: jest.fn() };
  const queueService = { enqueueSync: jest.fn().mockResolvedValue(undefined) };
  const coordinator = { run: jest.fn().mockResolvedValue(undefined) };

  const service = new JobIngestionService(
    jobSourceModel as any,
    queueService as any,
    coordinator as any,
  );

  return { service, jobSourceModel, queueService, coordinator };
};

describe('JobIngestionService', () => {
  describe('syncSource', () => {
    it('delegates to the coordinator', async () => {
      const { service, coordinator } = setup();

      await service.syncSource('topdev');

      expect(coordinator.run).toHaveBeenCalledWith('topdev');
    });
  });

  describe('enqueueEnabledSources', () => {
    it('enqueues every enabled source', async () => {
      const { service, jobSourceModel, queueService } = setup();
      jobSourceModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([{ key: 'greenhouse-axon' }, { key: 'lever-acme' }]),
        }),
      });

      await service.enqueueEnabledSources();

      expect(jobSourceModel.find).toHaveBeenCalledWith({ enabled: true });
      expect(queueService.enqueueSync).toHaveBeenCalledWith('greenhouse-axon');
      expect(queueService.enqueueSync).toHaveBeenCalledWith('lever-acme');
    });
  });

  describe('findAllSources', () => {
    it('leaves the rejection list out of the response', async () => {
      const { service, jobSourceModel } = setup();
      const query = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([SOURCE]),
      };
      jobSourceModel.find.mockReturnValue(query);

      await expect(service.findAllSources()).resolves.toEqual([SOURCE]);
      expect(query.select).toHaveBeenCalledWith('-rejections');
    });
  });

  describe('requestSync', () => {
    it('enqueues an existing source', async () => {
      const { service, jobSourceModel, queueService } = setup();
      jobSourceModel.exists.mockResolvedValue({ _id: 'x' });

      await expect(service.requestSync('greenhouse-axon')).resolves.toEqual({
        key: 'greenhouse-axon',
        queued: true,
      });
      expect(queueService.enqueueSync).toHaveBeenCalledWith('greenhouse-axon');
    });

    it('throws NotFoundException for an unknown source', async () => {
      const { service, jobSourceModel, queueService } = setup();
      jobSourceModel.exists.mockResolvedValue(null);

      await expect(service.requestSync('nope')).rejects.toBeInstanceOf(NotFoundException);
      expect(queueService.enqueueSync).not.toHaveBeenCalled();
    });
  });
});
