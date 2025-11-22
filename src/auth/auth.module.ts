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
 * Auth Module - Optimized Architecture
 * 
 * Kiến trúc mới:
 * 1. JWT Payload tối ưu (chỉ chứa userId)
 * 2. Hydrate user từ DB trong mỗi request (JwtStrategy)
 * 3. Multi-device session management (SessionsModule)
 * 4. Token Rotation Pattern (refresh token chỉ dùng 1 lần)
 * 5. Clean separation of concerns (Guards, Strategies, Services)
 * 
 * Strategies:
 * - LocalStrategy: Username/password authentication
 * - JwtStrategy: Access token validation + user hydration
 * - JwtRefreshStrategy: Refresh token validation + session checking
 * 
 * Guards:
 * - JwtAuthGuard: Protect routes with access token
 * - JwtRefreshGuard: Protect refresh endpoint
 * - LocalAuthGuard: Login endpoint
 */
@Module({
  imports: [
    UsersModule,
    RolesModule,
    SessionsModule, // Multi-device session management
    PassportModule,
    // Import MongooseModule để JwtStrategy có thể inject UserModel
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
    JwtStrategy, // Access token strategy với user hydration
    JwtRefreshStrategy, // Refresh token strategy với session validation
  ],
  controllers: [AuthController],
  exports: [AuthService], // Export để modules khác có thể sử dụng
})
export class AuthModule {}
