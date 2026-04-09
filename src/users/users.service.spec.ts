import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { UsersService } from './users.service';
import { User } from './schemas/user.schema';
import { Role } from 'src/roles/schemas/role.schema';
import { Job } from 'src/jobs/schemas/job.schema';
import { Company } from 'src/companies/schemas/company.schema';

describe('UsersService', () => {
  let service: UsersService;
  let mockUserModel: any;
  let mockRoleModel: any;
  let mockCompanyModel: any;

  const actingUser = {
    _id: '507f1f77bcf86cd799439001',
    email: 'admin@example.com',
    name: 'Admin',
    role: { _id: '507f1f77bcf86cd799439002', name: 'SUPER_ADMIN' },
    savedJobs: [],
    companyFollowed: [],
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    mockUserModel = {
      findById: jest.fn(),
      updateOne: jest.fn(),
    };
    mockRoleModel = {
      findById: jest.fn(),
    };
    mockCompanyModel = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: getModelToken(Role.name), useValue: mockRoleModel },
        { provide: getModelToken(Job.name), useValue: {} },
        { provide: getModelToken(Company.name), useValue: mockCompanyModel },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('update', () => {
    it('should normalize company snapshot when updating a user to HR', async () => {
      const userId = '507f1f77bcf86cd799439010';
      const hrRoleId = '507f1f77bcf86cd799439011';
      const companyId = '507f1f77bcf86cd799439012';

      mockUserModel.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          role: new mongoose.Types.ObjectId('507f1f77bcf86cd799439013'),
        }),
      });
      mockRoleModel.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ name: 'HR' }),
      });
      mockCompanyModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: new mongoose.Types.ObjectId(companyId),
          name: 'Canonical Corp',
          logo: 'canonical-logo.png',
        }),
      });
      mockUserModel.updateOne.mockResolvedValue({ matchedCount: 1 });

      await service.update(
        userId,
        {
          name: 'Target User',
          email: 'target@example.com',
          role: hrRoleId,
          company: {
            _id: companyId,
            name: 'Wrong Name',
            logo: 'wrong-logo.png',
          },
        },
        actingUser,
      );

      expect(mockUserModel.updateOne).toHaveBeenCalledWith(
        { _id: userId },
        expect.objectContaining({
          role: hrRoleId,
          company: {
            _id: expect.any(mongoose.Types.ObjectId),
            name: 'Canonical Corp',
            logo: 'canonical-logo.png',
          },
          updatedBy: {
            _id: actingUser._id,
            email: actingUser.email,
          },
        }),
      );
    });

    it('should reject HR updates without a company assignment', async () => {
      const userId = '507f1f77bcf86cd799439020';
      const hrRoleId = '507f1f77bcf86cd799439021';

      mockUserModel.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          role: new mongoose.Types.ObjectId('507f1f77bcf86cd799439022'),
        }),
      });
      mockRoleModel.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ name: 'HR' }),
      });

      await expect(
        service.update(
          userId,
          {
            name: 'Target User',
            email: 'target@example.com',
            role: hrRoleId,
          },
          actingUser,
        ),
      ).rejects.toThrow('HR user must be assigned to a company');

      expect(mockUserModel.updateOne).not.toHaveBeenCalled();
    });

    it('should clear company when updating a user away from HR role', async () => {
      const userId = '507f1f77bcf86cd799439030';
      const normalUserRoleId = '507f1f77bcf86cd799439031';

      mockUserModel.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          role: new mongoose.Types.ObjectId('507f1f77bcf86cd799439032'),
          company: {
            _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439033'),
            name: 'Legacy Corp',
            logo: 'legacy.png',
          },
        }),
      });
      mockRoleModel.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ name: 'NORMAL_USER' }),
      });
      mockUserModel.updateOne.mockResolvedValue({ matchedCount: 1 });

      await service.update(
        userId,
        {
          email: 'target@example.com',
          role: normalUserRoleId,
          name: 'Updated Name',
        },
        actingUser,
      );

      expect(mockUserModel.updateOne).toHaveBeenCalledWith(
        { _id: userId },
        expect.objectContaining({
          role: normalUserRoleId,
          name: 'Updated Name',
          updatedBy: {
            _id: actingUser._id,
            email: actingUser.email,
          },
          $unset: { company: 1 },
        }),
      );
    });
  });
});
