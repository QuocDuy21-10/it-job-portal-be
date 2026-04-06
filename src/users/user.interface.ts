export interface IUser {
  _id: string;
  name: string;
  email: string;
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
