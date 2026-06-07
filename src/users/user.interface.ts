import { ERole } from 'src/casl/enums/role.enum';

export interface IUser {
  _id: string;
  name: string;
  email: string;
  avatar?: string;
  authProvider: string;
  hasPassword: boolean;
  role: ERole;
  company?: {
    _id: string;
    name: string;
    logo?: string;
  };
  savedJobs: string[];
  companyFollowed: string[];
}
