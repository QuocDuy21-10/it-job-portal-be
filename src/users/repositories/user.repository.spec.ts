import mongoose from 'mongoose';
import { ERole } from 'src/casl/enums/role.enum';
import { UserRepository } from './user.repository';

describe('UserRepository', () => {
  let repository: UserRepository;
  let companyModel: { findOne: jest.Mock };

  beforeEach(() => {
    companyModel = { findOne: jest.fn() };

    repository = new UserRepository({} as any, {} as any, companyModel as any);
  });

  function mockCompany(company: Record<string, any> | null) {
    const select = jest.fn().mockResolvedValue(company);
    companyModel.findOne.mockReturnValue({ select });
    return { select };
  }

  describe('resolveCompanyAssignmentForRole', () => {
    it('should allow assigning a non-HR role without company data', async () => {
      const result = await repository.resolveCompanyAssignmentForRole(ERole.NORMAL_USER);

      expect(result).toBeUndefined();
      expect(companyModel.findOne).not.toHaveBeenCalled();
    });

    it('should reject roles that are not backed by CASL', async () => {
      await expect(
        repository.resolveCompanyAssignmentForRole('CUSTOM ROLE' as ERole),
      ).rejects.toThrow('Role is not supported by CASL');
    });

    it('should reject HR users without a company', async () => {
      await expect(repository.resolveCompanyAssignmentForRole(ERole.HR)).rejects.toThrow(
        'HR user must be assigned to a company',
      );
    });

    it('should return a canonical company snapshot for HR users', async () => {
      const companyId = new mongoose.Types.ObjectId().toString();
      mockCompany({
        _id: companyId,
        name: 'Canonical Corp',
        logo: undefined,
      });

      const result = await repository.resolveCompanyAssignmentForRole(ERole.HR, {
        _id: companyId,
        name: 'Wrong Name',
        logo: 'wrong-logo.png',
      });

      expect(result).toEqual({
        _id: new mongoose.Types.ObjectId(companyId),
        name: 'Canonical Corp',
        logo: null,
      });
      expect(companyModel.findOne).toHaveBeenCalledWith({
        _id: companyId,
        isDeleted: false,
      });
    });
  });
});
