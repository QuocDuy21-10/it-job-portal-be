import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from 'src/users/users.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { LocalStrategy } from './passport/local.strategy';
import { JwtStrategy } from './passport/jwt.strategy';
import { JwtRefreshStrategy } from './passport/jwt-refresh.strategy';
import ms from 'ms';
import { RolesModule } from 'src/roles/roles.module';
import { SessionsModule } from 'src/sessions/sessions.module';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from 'src/users/schemas/user.schema';

/**
 * KIẾN TRÚC TỐI ƯU:
 * 1. JWT Payload nhẹ (chỉ userId + type)
 * 2. JwtStrategy hydrate user 1 lần (tránh N queries ở từng API)
 * 3. API /me query lại DB để đảm bảo Fresh Data
 * 4. Multi-device session management
 * 5. Token Rotation Pattern (refresh token dùng 1 lần)
 * 
 * STRATEGIES:
 * - LocalStrategy: Username/password authentication
 * - JwtStrategy: Access token validation + user hydration
 * - JwtRefreshStrategy: Refresh token validation + session check
 * 
 * MODULES:
 * - UsersModule: User profile management (cung cấp UsersService cho /me API)
 * - RolesModule: Role & permission management
 * - SessionsModule: Multi-device session tracking
 * 
 * TẠI SAO HYDRATE USER Ở JwtStrategy?
 * - Hầu hết APIs cần user.email (audit log: createdBy, updatedBy)
 * - Một số APIs cần user.role.name, user.company._id (authorization)
 * - Hydrate 1 lần tại Strategy → tránh query DB ở từng API
 * - API /me đặc biệt → query lại DB để lấy 100% fresh data
 */
@Module({
  imports: [
    UsersModule, 
    RolesModule, 
    SessionsModule, 
    PassportModule,
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    JwtModule.registerAsync({
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_ACCESS_TOKEN_SECRET'),
        signOptions: { expiresIn: ms(configService.get<string>('JWT_ACCESS_EXPIRES_IN')) / 1000 },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    AuthService,
    LocalStrategy, 
    JwtStrategy, 
    JwtRefreshStrategy, 
  ],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
