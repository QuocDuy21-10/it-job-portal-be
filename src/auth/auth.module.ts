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
import { SessionsModule } from 'src/sessions/sessions.module';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from 'src/users/schemas/user.schema';
import { MailService } from 'src/mail/mail.service';
import { AuthAccountDeletionService } from './services/auth-account-deletion.service';
import { AuthCredentialsService } from './services/auth-credentials.service';
import { AuthGoogleService } from './services/auth-google.service';
import { AuthSessionService } from './services/auth-session.service';
import { AuthVerificationService } from './services/auth-verification.service';

@Module({
  imports: [
    UsersModule,
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
    AuthCredentialsService,
    AuthVerificationService,
    AuthSessionService,
    AuthGoogleService,
    AuthAccountDeletionService,
    LocalStrategy,
    JwtStrategy,
    JwtRefreshStrategy,
    MailService,
  ],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
