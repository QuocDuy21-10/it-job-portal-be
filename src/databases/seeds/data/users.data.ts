import { Types } from 'mongoose';

export function createUsersSeedData(
  adminRoleId: Types.ObjectId,
  userRoleId: Types.ObjectId,
  adminEmail: string,
  hashedPassword: string,
) {
  return [
    {
      name: 'Super Admin',
      email: adminEmail,
      password: hashedPassword,
      authProvider: 'local',
      role: adminRoleId,
      isActive: true,
    },
    {
      name: 'Normal User',
      email: 'user@gmail.com',
      password: hashedPassword,
        authProvider: 'local',
      role: userRoleId,
      isActive: true,
    },
  ];
}
