import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { JobsService } from './jobs.service';
import { Job } from './schemas/job.schema';
import { Company } from 'src/companies/schemas/company.schema';
import { CompanyFollowerQueueService } from 'src/queues/services/company-follower-queue.service';

describe('JobsService', () => {
  let service: JobsService;
  let mockJobModel: any;

  beforeEach(async () => {
    mockJobModel = {
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: getModelToken(Job.name), useValue: mockJobModel },
        { provide: getModelToken(Company.name), useValue: {} },
        {
          provide: CompanyFollowerQueueService,
          useValue: {
            addNewJobNotification: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
  });

  describe('findAll', () => {
    it('should filter HR job results by both legacy string and normalized ObjectId company ids', async () => {
      const companyId = '507f1f77bcf86cd799439041';

      mockJobModel.find
        .mockReturnValueOnce(Promise.resolve([{ _id: 'job-1' }]))
        .mockReturnValueOnce({
          skip: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          populate: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue([{ _id: 'job-1' }]),
        });

      await service.findAll(1, 10, '', {
        _id: '507f1f77bcf86cd799439042',
        name: 'Henry HR',
        email: 'henry@example.com',
        role: {
          _id: '507f1f77bcf86cd799439043',
          name: 'HR',
        },
        company: {
          _id: companyId,
          name: 'Acme HR',
        },
        savedJobs: [],
        companyFollowed: [],
      });

      const firstFilter = mockJobModel.find.mock.calls[0][0];
      expect(firstFilter['company._id'].$in).toEqual(
        expect.arrayContaining([companyId, expect.any(mongoose.Types.ObjectId)]),
      );
    });
  });
});
