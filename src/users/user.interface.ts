export interface IUser {
  _id: string;
  name: string;
  email: string;
  authProvider: string;
  hasPassword: boolean;
  role: {
    _id: string;
    name: string;
  };
  company?: {
    _id: string;
    name: string;
    logo?: string;
  };
  savedJobs: string[];
  companyFollowed: string[];
}
