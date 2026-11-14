import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { join } from 'path';
import helmet from 'helmet';
import { TransformInterceptor } from './utils/transform.interceptor';
import { JwtAuthGuard } from './auth/guards';
import { RolesGuard } from './casl';
import { parseCorsOrigins } from './config/cors-origins';

/** Global HTTP pipeline, shared by main.ts and the e2e suite so tests run what production runs. */
export function configureApp(app: NestExpressApplication): void {
  const configService = app.get(ConfigService);

  // config helmet (first, so every response gets security headers)
  app.use(helmet());

  // behind nginx/Caddy, use the client IP from X-Forwarded-For for throttling and sessions
  const trustProxy = configService.get<string>('TRUST_PROXY');
  if (trustProxy) {
    app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
  }

  // config jwt guard global
  const reflector = app.get(Reflector);
  app.useGlobalGuards(new JwtAuthGuard(reflector), new RolesGuard(reflector));

  // config transform interceptor global
  app.useGlobalInterceptors(new TransformInterceptor(reflector));

  // config static
  app.useStaticAssets(join(__dirname, '..', 'public'));

  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  // config cookie parser
  app.use(cookieParser());

  // config cors: only allow known frontends to send credentialed requests
  const corsOrigins = parseCorsOrigins(
    configService.get<string>('CORS_ORIGINS') || configService.get<string>('FE_URL'),
  );
  app.enableCors({
    origin: corsOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    preflightContinue: false,
    optionsSuccessStatus: 204,
    credentials: true,
  });

  // config versioning
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: ['1'],
  });
}
