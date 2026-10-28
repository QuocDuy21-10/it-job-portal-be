import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { TransformInterceptor } from './utils/transform.interceptor';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { join } from 'path';
import helmet from 'helmet';
import { JwtAuthGuard } from './auth/guards';
import { RolesGuard } from './casl';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger:
      process.env.NODE_ENV === 'production'
        ? ['error', 'warn', 'log']
        : ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);
  const isProduction = configService.get<string>('NODE_ENV') === 'production';

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
  const corsOrigins = (
    configService.get<string>('CORS_ORIGINS') || configService.get<string>('FE_URL')
  )
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
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

  // config swagger (hidden in production unless explicitly enabled)
  if (!isProduction || configService.get<string>('SWAGGER_ENABLED') === 'true') {
    const config = new DocumentBuilder()
      .setTitle('DevLink Job Portal API')
      .setDescription('All module APIs')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'Bearer',
          bearerFormat: 'JWT',
          in: 'header',
        },
        'token',
      )
      .addSecurityRequirements('token')
      .build();
    const documentFactory = () => SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, documentFactory, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  // close Mongo, Redis and BullMQ workers cleanly on SIGTERM (docker stop)
  app.enableShutdownHooks();

  const port = configService.get<string>('PORT');
  await app.listen(port, '0.0.0.0');
  Logger.log(`Application is running on port http://localhost:${port}/api`);
}
bootstrap();
