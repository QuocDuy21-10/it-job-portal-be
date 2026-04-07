import { ERole } from 'src/casl/enums/role.enum';

export const ROLES_SEED_DATA = [
  {
    name: ERole.SUPER_ADMIN,
    description: 'Admin has full rights',
    isActive: true,
  },
  {
    name: ERole.NORMAL_USER,
    description: 'Users/Candidates using the system',
    isActive: true,
  },
  {
    name: ERole.HR,
    description: 'HR role for managing job postings and applicants',
    isActive: true,
  },
];
