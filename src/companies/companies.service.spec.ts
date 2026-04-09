import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { CompaniesService } from './companies.service';
import { Company } from './schemas/company.schema';
import { Job } from 'src/jobs/schemas/job.schema';
import { FilesService } from 'src/files/files.service';

describe('CompaniesService', () => {
  let service: CompaniesService;
  let mockCompanyModel: any;
  let mockJobModel: any;

  beforeEach(async () => {
    mockCompanyModel = {
      find: jest.fn(),
    };
    mockJobModel = {
      aggregate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompaniesService,
        { provide: getModelToken(Company.name), useValue: mockCompanyModel },
        { provide: getModelToken(Job.name), useValue: mockJobModel },
        {
          provide: FilesService,
          useValue: {
            deleteFile: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CompaniesService>(CompaniesService);
  });

  describe('findAll', () => {
    it('should aggregate jobs using ObjectId company ids and map totalJobs correctly', async () => {
      const companyOneId = new mongoose.Types.ObjectId();
      const companyTwoId = new mongoose.Types.ObjectId();

      const companies = [
        {
          _id: companyOneId,
          name: 'Company One',
          toObject: jest.fn().mockReturnValue({ _id: companyOneId, name: 'Company One' }),
        },
        {
          _id: companyTwoId,
          name: 'Company Two',
          toObject: jest.fn().mockReturnValue({ _id: companyTwoId, name: 'Company Two' }),
        },
      ];

      mockCompanyModel.find
        .mockReturnValueOnce(Promise.resolve(companies))
        .mockReturnValueOnce({
          skip: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          populate: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue(companies),
        });

      mockJobModel.aggregate.mockResolvedValue([
        {
          _id: companyOneId,
          totalJobs: 3,
        },
      ]);

      const result = await service.findAll(1, 10, '');

      expect(mockJobModel.aggregate).toHaveBeenCalledTimes(1);

      const pipeline = mockJobModel.aggregate.mock.calls[0][0];
      const matchedCompanyIds = pipeline[0].$match['company._id'].$in;

      expect(matchedCompanyIds).toEqual(
        expect.arrayContaining([
          companyOneId,
          companyTwoId,
          companyOneId.toString(),
          companyTwoId.toString(),
        ]),
      );
      expect(matchedCompanyIds).toHaveLength(4);

      expect(result.result).toEqual([
        {
          _id: companyOneId,
          name: 'Company One',
          totalJobs: 3,
        },
        {
          _id: companyTwoId,
          name: 'Company Two',
          totalJobs: 0,
        },
      ]);
    });
  });
});
