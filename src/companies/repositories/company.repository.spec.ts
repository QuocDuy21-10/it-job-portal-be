import { CompanyRepository } from './company.repository';
import { EJobApprovalStatus } from 'src/jobs/enums/job-approval-status.enum';

describe('CompanyRepository', () => {
  let repository: CompanyRepository;
  let mockJobModel: { aggregate: jest.Mock };

  beforeEach(() => {
    mockJobModel = {
      aggregate: jest.fn().mockResolvedValue([]),
    };

    repository = new CompanyRepository({} as any, mockJobModel as any);
  });

  describe('findTopHiringCompanies', () => {
    it('should aggregate approved active non-expired jobs and rank companies', async () => {
      await repository.findTopHiringCompanies(10);

      const pipeline = mockJobModel.aggregate.mock.calls[0][0];

      expect(pipeline[0]).toEqual({
        $match: {
          isActive: true,
          isDeleted: { $ne: true },
          approvalStatus: EJobApprovalStatus.APPROVED,
          $or: [{ endDate: { $gte: expect.any(Date) } }, { endDate: null }],
        },
      });
      expect(pipeline).toEqual(
        expect.arrayContaining([
          { $addFields: { companyIdString: { $toString: '$company._id' } } },
          {
            $group: {
              _id: '$companyIdString',
              companyName: { $first: '$company.name' },
              totalOpenJobs: { $sum: 1 },
              latestJobCreatedAt: { $max: '$createdAt' },
            },
          },
          {
            $sort: {
              totalOpenJobs: -1,
              latestJobCreatedAt: -1,
              companyName: 1,
            },
          },
          { $limit: 10 },
        ]),
      );
    });

    it('should lookup non-deleted companies after applying limit', async () => {
      await repository.findTopHiringCompanies(6);

      const pipeline = mockJobModel.aggregate.mock.calls[0][0];
      const limitIndex = pipeline.findIndex((stage: Record<string, unknown>) => stage.$limit === 6);
      const lookupIndex = pipeline.findIndex((stage: Record<string, unknown>) => stage.$lookup);

      expect(limitIndex).toBeGreaterThan(-1);
      expect(lookupIndex).toBeGreaterThan(limitIndex);
      expect(pipeline).toEqual(
        expect.arrayContaining([
          { $unwind: '$company' },
          { $match: { 'company.isDeleted': { $ne: true } } },
          {
            $project: {
              _id: '$_id',
              name: '$company.name',
              logo: '$company.logo',
              address: '$company.address',
              website: '$company.website',
              numberOfEmployees: '$company.numberOfEmployees',
              totalOpenJobs: 1,
            },
          },
        ]),
      );
    });
  });
});
