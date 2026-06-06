import { ERole } from 'src/casl/enums/role.enum';

export function createUsersSeedData(adminEmail: string, hashedPassword: string) {
  return [
    {
      name: 'Super Admin',
      email: adminEmail,
      password: hashedPassword,
      authProvider: 'local',
      role: ERole.SUPER_ADMIN,
      isActive: true,
    },
    {
      name: 'Normal User',
      email: 'user@gmail.com',
      password: hashedPassword,
      authProvider: 'local',
      role: ERole.NORMAL_USER,
      isActive: true,
    },
  ];
}
