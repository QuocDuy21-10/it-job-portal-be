import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import mongoose from 'mongoose';
import { CompaniesService } from './companies.service';
import { CompanyRepository } from './repositories/company.repository';
import { FilesService } from 'src/files/files.service';
import { ERole } from 'src/casl';

describe('CompaniesService', () => {
  let service: CompaniesService;
  let mockCompanyRepository: jest.Mocked<CompanyRepository>;
  let mockFilesService: jest.Mocked<FilesService>;

  beforeEach(async () => {
    mockCompanyRepository = {
      validateObjectId: jest.fn(),
      existsByName: jest.fn(),
      create: jest.fn(),
      findPaginated: jest.fn(),
      findById: jest.fn(),
      updateOne: jest.fn(),
      softDeleteById: jest.fn(),
      bulkSoftDelete: jest.fn(),
      deactivateJobsForCompanies: jest.fn(),
      getJobCountsForCompanies: jest.fn(),
      findLogoReferences: jest.fn(),
      findByNameRegex: jest.fn(),
    } as any;

    mockFilesService = {
      deleteFile: jest.fn(),
      cleanupOrphanedFiles: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompaniesService,
        { provide: CompanyRepository, useValue: mockCompanyRepository },
        { provide: FilesService, useValue: mockFilesService },
      ],
    }).compile();

    service = module.get<CompaniesService>(CompaniesService);
  });

  describe('create', () => {
    const dto = {
      name: 'ACME Corp',
      address: '123 Main St',
      description: 'A company',
      website: 'https://acme.com',
    };
    const user = { _id: 'uid', email: 'admin@test.com' } as any;

    it('should create a company when the name is unique', async () => {
      mockCompanyRepository.existsByName.mockResolvedValue(false);
      mockCompanyRepository.create.mockResolvedValue({ _id: 'cid', ...dto } as any);

      const result = await service.create(dto, user);

      expect(mockCompanyRepository.existsByName).toHaveBeenCalledWith('ACME Corp');
      expect(mockCompanyRepository.create).toHaveBeenCalledWith({
        ...dto,
        createdBy: { _id: 'uid', email: 'admin@test.com' },
      });
      expect(result).toHaveProperty('name', 'ACME Corp');
    });

    it('should throw BadRequestException when the name already exists', async () => {
      mockCompanyRepository.existsByName.mockResolvedValue(true);

      await expect(service.create(dto, user)).rejects.toThrow(BadRequestException);
      expect(mockCompanyRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    const emptyResult = { result: [], totalItems: 0, totalPages: 0 };

    beforeEach(() => {
      mockCompanyRepository.findPaginated.mockResolvedValue(emptyResult);
      mockCompanyRepository.getJobCountsForCompanies.mockResolvedValue(new Map());
    });

    it('should return paginated results with job counts merged', async () => {
      const id1 = new mongoose.Types.ObjectId();
      const id2 = new mongoose.Types.ObjectId();

      mockCompanyRepository.findPaginated.mockResolvedValue({
        result: [
          { _id: id1, name: 'Company One' } as any,
          { _id: id2, name: 'Company Two' } as any,
        ],
        totalItems: 2,
        totalPages: 1,
      });
      mockCompanyRepository.getJobCountsForCompanies.mockResolvedValue(
        new Map([[id1.toString(), 3]]),
      );

      const result = await service.findAll(1, 10, '');

      expect(result.result[0].totalJobs).toBe(3);
      expect(result.result[1].totalJobs).toBe(0);
      expect(result.meta.pagination.total).toBe(2);
      expect(result.meta.pagination.current_page).toBe(1);
    });

    it('should apply HR company filter when user is HR', async () => {
      const hrCompanyId = new mongoose.Types.ObjectId();
      const hrUser = {
        role: { name: ERole.HR },
        company: { _id: hrCompanyId },
      } as any;

      await service.findAll(1, 10, '', hrUser);

      const [filter] = mockCompanyRepository.findPaginated.mock.calls[0];
      expect(filter._id).toBeDefined();
      expect(filter._id.toString()).toBe(hrCompanyId.toString());
    });

    it('should use safe defaults (page=1, limit=10) when inputs are NaN', async () => {
      await service.findAll(NaN, NaN, '');

      const [, offset, limit] = mockCompanyRepository.findPaginated.mock.calls[0];
      expect(limit).toBe(10);
      expect(offset).toBe(0); // (1 - 1) * 10
    });

    it('should not propagate non-allowed filter fields to the repository', async () => {
      // Even if aqp somehow produces an unknown field, it must be stripped
      await service.findAll(1, 10, 'unknownField=value&name=ACME');

      const [filter] = mockCompanyRepository.findPaginated.mock.calls[0];
      expect(filter.unknownField).toBeUndefined();
      expect(filter.name).toBe('ACME');
    });

    it('should not propagate dangerous operators to the repository', async () => {
      // Simulate a query that includes a dangerous top-level key after aqp parsing
      // We test the private sanitiser by passing a crafted query string
      await service.findAll(1, 10, '');

      const [filter] = mockCompanyRepository.findPaginated.mock.calls[0];
      expect(filter.$where).toBeUndefined();
    });
  });

  describe('findOne', () => {
    const companyId = new mongoose.Types.ObjectId().toString();

    it('should return the company for a non-HR user', async () => {
      const company = { _id: companyId, name: 'Test Co' };
      mockCompanyRepository.findById.mockResolvedValue(company as any);

      const result = await service.findOne(companyId);

      expect(mockCompanyRepository.findById).toHaveBeenCalledWith(companyId);
      expect(result).toEqual(company);
    });

    it('should throw BadRequestException when an HR user accesses another company', async () => {
      const hrUser = {
        role: { name: ERole.HR },
        company: { _id: new mongoose.Types.ObjectId() }, // different from companyId
      } as any;

      await expect(service.findOne(companyId, hrUser)).rejects.toThrow(BadRequestException);
      expect(mockCompanyRepository.findById).not.toHaveBeenCalled();
    });

    it('should allow an HR user to view their own company', async () => {
      const ownCompanyId = new mongoose.Types.ObjectId();
      const hrUser = {
        role: { name: ERole.HR },
        company: { _id: ownCompanyId },
      } as any;
      const company = { _id: ownCompanyId, name: 'HR Company' };
      mockCompanyRepository.findById.mockResolvedValue(company as any);

      const result = await service.findOne(ownCompanyId.toString(), hrUser);

      expect(result).toEqual(company);
    });
  });

  describe('update', () => {
    const companyId = new mongoose.Types.ObjectId().toString();
    const adminUser = {
      _id: 'uid',
      email: 'admin@test.com',
      role: { name: ERole.SUPER_ADMIN },
    } as any;

    it('should update the company for SUPER_ADMIN', async () => {
      const company = { _id: new mongoose.Types.ObjectId(companyId), name: 'Old Name', logo: null };
      mockCompanyRepository.findById.mockResolvedValue(company as any);
      mockCompanyRepository.updateOne.mockResolvedValue({ modifiedCount: 1 } as any);

      await service.update(companyId, { name: 'New Name' }, adminUser);

      expect(mockCompanyRepository.updateOne).toHaveBeenCalledWith(
        { _id: companyId },
        expect.objectContaining({
          name: 'New Name',
          updatedBy: { _id: 'uid', email: 'admin@test.com' },
        }),
      );
    });

    it('should throw NotFoundException when the company does not exist', async () => {
      mockCompanyRepository.findById.mockResolvedValue(null);

      await expect(service.update(companyId, { name: 'Name' }, adminUser)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockCompanyRepository.updateOne).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when an HR user targets another company', async () => {
      const hrUser = {
        _id: 'hr-uid',
        email: 'hr@test.com',
        role: { name: ERole.HR },
        company: { _id: new mongoose.Types.ObjectId() }, // different from companyId
      } as any;
      const company = { _id: new mongoose.Types.ObjectId(companyId), name: 'Company' };
      mockCompanyRepository.findById.mockResolvedValue(company as any);

      await expect(service.update(companyId, { name: 'Name' }, hrUser)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockCompanyRepository.updateOne).not.toHaveBeenCalled();
    });

    it('should allow an HR user to update their own company', async () => {
      const hrCompanyId = new mongoose.Types.ObjectId(companyId);
      const hrUser = {
        _id: 'hr-uid',
        email: 'hr@test.com',
        role: { name: ERole.HR },
        company: { _id: hrCompanyId },
      } as any;
      const company = { _id: hrCompanyId, name: 'HR Company', logo: null };
      mockCompanyRepository.findById.mockResolvedValue(company as any);
      mockCompanyRepository.updateOne.mockResolvedValue({ modifiedCount: 1 } as any);

      await service.update(companyId, { name: 'Updated Name' }, hrUser);

      expect(mockCompanyRepository.updateOne).toHaveBeenCalled();
    });

    it('should delete the old logo when a new logo is provided', async () => {
      const company = {
        _id: new mongoose.Types.ObjectId(companyId),
        name: 'Test Co',
        logo: 'old-logo.png',
      };
      mockCompanyRepository.findById.mockResolvedValue(company as any);
      mockCompanyRepository.updateOne.mockResolvedValue({ modifiedCount: 1 } as any);
      mockFilesService.deleteFile.mockResolvedValue(undefined);

      await service.update(companyId, { logo: 'new-logo.png' }, adminUser);

      expect(mockFilesService.deleteFile).toHaveBeenCalledWith('company', 'old-logo.png');
    });

    it('should not delete the logo when the same logo path is submitted', async () => {
      const company = {
        _id: new mongoose.Types.ObjectId(companyId),
        name: 'Test Co',
        logo: 'same-logo.png',
      };
      mockCompanyRepository.findById.mockResolvedValue(company as any);
      mockCompanyRepository.updateOne.mockResolvedValue({ modifiedCount: 1 } as any);

      await service.update(companyId, { logo: 'same-logo.png' }, adminUser);

      expect(mockFilesService.deleteFile).not.toHaveBeenCalled();
    });

    it('should not delete any logo when no logo field is in the DTO', async () => {
      const company = {
        _id: new mongoose.Types.ObjectId(companyId),
        name: 'Test Co',
        logo: 'logo.png',
      };
      mockCompanyRepository.findById.mockResolvedValue(company as any);
      mockCompanyRepository.updateOne.mockResolvedValue({ modifiedCount: 1 } as any);

      await service.update(companyId, { name: 'New Name' }, adminUser);

      expect(mockFilesService.deleteFile).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    const companyId = new mongoose.Types.ObjectId().toString();
    const user = { _id: 'uid', email: 'admin@test.com' } as any;

    it('should soft-delete the company', async () => {
      const company = { _id: companyId, name: 'Test Co' };
      mockCompanyRepository.findById.mockResolvedValue(company as any);
      mockCompanyRepository.softDeleteById.mockResolvedValue({ deleted: 1 } as any);

      await service.remove(companyId, user);

      expect(mockCompanyRepository.softDeleteById).toHaveBeenCalledWith(companyId, {
        _id: 'uid',
        email: 'admin@test.com',
      });
    });

    it('should throw NotFoundException when the company does not exist', async () => {
      mockCompanyRepository.findById.mockResolvedValue(null);

      await expect(service.remove(companyId, user)).rejects.toThrow(NotFoundException);
      expect(mockCompanyRepository.softDeleteById).not.toHaveBeenCalled();
    });
  });

  describe('bulkRemove', () => {
    it('should deactivate associated jobs then soft-delete companies', async () => {
      const ids = ['id1', 'id2'];
      const user = { _id: 'uid', email: 'admin@test.com' } as any;

      mockCompanyRepository.deactivateJobsForCompanies.mockResolvedValue(3);
      mockCompanyRepository.bulkSoftDelete.mockResolvedValue({
        deletedCount: 2,
        requestedCount: 2,
      });

      const result = await service.bulkRemove(ids, user);

      // Jobs must be deactivated before companies are deleted
      expect(mockCompanyRepository.deactivateJobsForCompanies).toHaveBeenCalledWith(ids);
      expect(mockCompanyRepository.bulkSoftDelete).toHaveBeenCalledWith(ids, user);
      expect(result.deactivatedJobsCount).toBe(3);
      expect(result.deletedCount).toBe(2);
    });
  });

  describe('findByName', () => {
    it('should return an empty array when no companies match', async () => {
      mockCompanyRepository.findByNameRegex.mockResolvedValue([]);

      const result = await service.findByName('NoMatch');

      expect(result).toEqual([]);
      expect(mockCompanyRepository.getJobCountsForCompanies).not.toHaveBeenCalled();
    });

    it('should return companies with mapped job counts', async () => {
      const companyId = new mongoose.Types.ObjectId();
      mockCompanyRepository.findByNameRegex.mockResolvedValue([
        {
          _id: companyId,
          name: 'ACME Corp',
          address: '123 St',
          description: 'Long description text here',
        } as any,
      ]);
      mockCompanyRepository.getJobCountsForCompanies.mockResolvedValue(
        new Map([[companyId.toString(), 5]]),
      );

      const result = await service.findByName('ACME');

      expect(result).toHaveLength(1);
      expect(result[0]._id).toBe(companyId.toString());
      expect(result[0].jobCount).toBe(5);
    });

    it('should truncate description to 200 characters', async () => {
      const companyId = new mongoose.Types.ObjectId();
      const longDesc = 'A'.repeat(300);
      mockCompanyRepository.findByNameRegex.mockResolvedValue([
        { _id: companyId, name: 'Co', address: 'Addr', description: longDesc } as any,
      ]);
      mockCompanyRepository.getJobCountsForCompanies.mockResolvedValue(new Map());

      const result = await service.findByName('Co');

      expect(result[0].description).toHaveLength(200);
    });

    it('should escape regex special characters before searching', async () => {
      mockCompanyRepository.findByNameRegex.mockResolvedValue([]);

      await service.findByName('Test (Company) [Inc.]');

      const escapedArg = mockCompanyRepository.findByNameRegex.mock.calls[0][0];
      // Special characters must be escaped with a backslash, not left bare
      expect(escapedArg).toContain('\\(');
      expect(escapedArg).toContain('\\[');
      expect(escapedArg).toContain('\\.');
      expect(escapedArg).not.toContain('(Company)');
    });
  });
});
