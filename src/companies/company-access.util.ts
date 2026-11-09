import { ForbiddenException } from '@nestjs/common';
import { ERole } from 'src/casl/enums/role.enum';
import { IUser } from 'src/users/user.interface';

const DEFAULT_MESSAGE = 'You can only access resources of your own company';

/** SUPER_ADMIN may act on any company, HR only on its own; everyone else is rejected (fail closed). */
export function assertCompanyAccess(
  user: IUser | undefined,
  companyId: unknown,
  message = DEFAULT_MESSAGE,
): void {
  if (user?.role === ERole.SUPER_ADMIN) return;
  if (user?.role !== ERole.HR) throw new ForbiddenException(message);
  if (!user.company?._id) {
    throw new ForbiddenException('HR user must be associated with a company');
  }
  if (companyId == null || String(companyId) !== String(user.company._id)) {
    throw new ForbiddenException(message);
  }
}
