import { ForbiddenException } from '@nestjs/common';
import { ERole } from 'src/casl/enums/role.enum';
import { IUser } from 'src/users/user.interface';
import { assertCompanyAccess } from './company-access.util';

const baseUser = {
  _id: 'u1',
  name: 'U',
  email: 'u@example.com',
  authProvider: 'local',
  hasPassword: true,
  savedJobs: [],
  companyFollowed: [],
};
const hr = (companyId?: string): IUser => ({
  ...baseUser,
  role: ERole.HR,
  company: companyId ? { _id: companyId, name: 'Acme' } : undefined,
});
const admin: IUser = { ...baseUser, role: ERole.SUPER_ADMIN };
const candidate: IUser = { ...baseUser, role: ERole.NORMAL_USER };

describe('assertCompanyAccess', () => {
  it('allows SUPER_ADMIN for any company', () => {
    expect(() => assertCompanyAccess(admin, 'any-company')).not.toThrow();
  });

  it('allows HR for their own company, comparing as strings', () => {
    const objectIdLike = { toString: () => 'c1' };
    expect(() => assertCompanyAccess(hr('c1'), objectIdLike)).not.toThrow();
  });

  it('rejects HR for another company with the given message', () => {
    expect(() => assertCompanyAccess(hr('c1'), 'c2', 'nope')).toThrow(
      new ForbiddenException('nope'),
    );
  });

  it('rejects HR without a company (fail closed)', () => {
    expect(() => assertCompanyAccess(hr(), 'c1')).toThrow(
      new ForbiddenException('HR user must be associated with a company'),
    );
  });

  it('rejects HR when the target company is missing', () => {
    expect(() => assertCompanyAccess(hr('c1'), undefined)).toThrow(ForbiddenException);
  });

  it('rejects other roles and anonymous callers', () => {
    expect(() => assertCompanyAccess(candidate, 'c1')).toThrow(ForbiddenException);
    expect(() => assertCompanyAccess(undefined, 'c1')).toThrow(ForbiddenException);
  });
});
