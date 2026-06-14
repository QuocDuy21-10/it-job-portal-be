import { Types } from 'mongoose';

import { EAuthProvider } from 'src/auth/enums/auth-provider.enum';
import { ERole } from 'src/casl/enums/role.enum';

export type SeedCompanyRef = {
  _id: Types.ObjectId;
  name: string;
  logo?: string | null;
};

export type UserSeed = {
  name: string;
  email: string;
  password: string;
  authProvider: EAuthProvider;
  role: ERole;
  isActive: boolean;
  isLocked?: boolean;
  company?: {
    _id: Types.ObjectId;
    name: string;
    logo?: string | null;
  };
  savedJobs?: Types.ObjectId[];
  companyFollowed?: Types.ObjectId[];
  createdAt?: Date;
  updatedAt?: Date;
};

const adminNames = [
  'Super Admin',
  'Platform Admin',
  'Operations Admin',
  'Content Admin',
  'Support Admin',
];

const hrNames = [
  'Nguyen Minh Anh',
  'Tran Bao Chau',
  'Le Quang Huy',
  'Pham Thu Ha',
  'Hoang Gia Bao',
  'Do Khanh Linh',
  'Bui Tuan Kiet',
  'Dang Ngoc Mai',
  'Vo Thanh Dat',
  'Phan Hoai Nam',
  'Vu Thao Nhi',
  'Ngo Duc Anh',
  'Huynh Phuong Vy',
  'Truong Minh Quan',
  'Dinh Thanh Truc',
  'Ly Hoang Phuc',
  'Mai Quoc Viet',
  'Ta Gia Han',
  'Cao Minh Tri',
  'Lam Ngoc Diep',
];

const candidateNames = [
  'Nguyen Van An',
  'Tran Thi Bich',
  'Le Minh Cuong',
  'Pham Ngoc Dung',
  'Hoang Anh Khoa',
  'Do Thi Lan',
  'Bui Quang Minh',
  'Dang Thu Nga',
  'Vo Hoang Phong',
  'Phan My Quyen',
  'Vu Duc Son',
  'Ngo Thanh Tam',
  'Huynh Bao Tran',
  'Truong Gia Uy',
  'Dinh Ngoc Van',
  'Ly Tuan Anh',
  'Mai Phuong Chi',
  'Ta Minh Duc',
  'Cao Thanh Giang',
  'Lam Quoc Hieu',
  'Nguyen Hoai Linh',
  'Tran Gia Nghi',
  'Le Duc Phat',
  'Pham Khanh Vy',
  'Hoang Minh Quan',
];

const slugify = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const companySnapshot = (company: SeedCompanyRef) => ({
  _id: company._id,
  name: company.name,
  logo: company.logo ?? null,
});

export function getSeedUserEmails(adminEmail: string): string[] {
  return [
    adminEmail.toLowerCase(),
    ...Array.from(
      { length: 4 },
      (_, index) => `admin${String(index + 2).padStart(2, '0')}@seed.local`,
    ),
    ...Array.from(
      { length: 20 },
      (_, index) => `hr${String(index + 1).padStart(2, '0')}@seed.local`,
    ),
    ...Array.from(
      { length: 75 },
      (_, index) => `candidate${String(index + 1).padStart(3, '0')}@seed.local`,
    ),
  ];
}

export function createUsersSeedData(
  adminEmail: string,
  hashedPassword: string,
  companies: SeedCompanyRef[],
): UserSeed[] {
  const now = new Date();
  const admins = adminNames.map((name, index) => ({
    name,
    email:
      index === 0
        ? adminEmail.toLowerCase()
        : `admin${String(index + 1).padStart(2, '0')}@seed.local`,
    password: hashedPassword,
    authProvider: EAuthProvider.LOCAL,
    role: ERole.SUPER_ADMIN,
    isActive: true,
    isLocked: false,
    createdAt: now,
    updatedAt: now,
  }));

  const hrs = Array.from({ length: 20 }, (_, index) => {
    const company = companies[index % companies.length];

    return {
      name: hrNames[index],
      email: `hr${String(index + 1).padStart(2, '0')}@seed.local`,
      password: hashedPassword,
      authProvider: EAuthProvider.LOCAL,
      role: ERole.HR,
      isActive: true,
      isLocked: false,
      company: companySnapshot(company),
      companyFollowed: [],
      savedJobs: [],
      createdAt: now,
      updatedAt: now,
    };
  });

  const candidates = Array.from({ length: 75 }, (_, index) => {
    const name = candidateNames[index % candidateNames.length];
    const sequence = Math.floor(index / candidateNames.length) + 1;
    const displayName = sequence === 1 ? name : `${name} ${sequence}`;

    return {
      name: displayName,
      email: `candidate${String(index + 1).padStart(3, '0')}@seed.local`,
      password: hashedPassword,
      authProvider: EAuthProvider.LOCAL,
      role: ERole.NORMAL_USER,
      isActive: true,
      isLocked: index % 37 === 0,
      avatar: null,
      savedJobs: [],
      companyFollowed: companies
        .filter((_, companyIndex) => (companyIndex + index) % 9 === 0)
        .slice(0, 3)
        .map(company => company._id),
      createdAt: now,
      updatedAt: now,
    };
  });

  return [...admins, ...hrs, ...candidates].map(user => ({
    ...user,
    email: user.email.toLowerCase(),
    name: user.name || slugify(user.email),
  }));
}
