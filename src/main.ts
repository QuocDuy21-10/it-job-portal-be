import './instrument';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger as PinoLogger } from 'nestjs-pino';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));

  const configService = app.get(ConfigService);
  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  configureApp(app);

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
