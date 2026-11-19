import 'dotenv/config';
import { RequestMethod, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import type { AllConfigType } from './config/config.type';
import {
  CORRELATION_ID_HEADER,
  correlationIdMiddleware,
} from './http/correlation-id.middleware';
import { ProblemDetailsFilter } from './http/problem-details.filter';
import validationOptions from './utils/validation-options';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService<AllConfigType>);
  const production =
    config.getOrThrow('app.nodeEnv', { infer: true }) === 'production';
  const proxyHops = config.getOrThrow('app.trustProxyHops', { infer: true });
  if (proxyHops) app.set('trust proxy', proxyHops);

  app.use(correlationIdMiddleware);
  app.use(helmet());
  app.enableCors({
    origin: config.getOrThrow('app.corsOrigins', { infer: true }),
  });
  app.enableShutdownHooks();
  app.setGlobalPrefix('api', {
    exclude: [
      {
        path: 'internal/media/v1/{*path}',
        method: RequestMethod.ALL,
      },
    ],
  });
  app.enableVersioning({ type: VersioningType.URI });
  app.useGlobalPipes(new ValidationPipe(validationOptions));
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.use(
    '/api',
    (_request: Request, response: Response, next: NextFunction) => {
      response.setHeader('Cache-Control', 'no-store');
      next();
    },
  );

  if (!production) {
    const docs = new DocumentBuilder()
      .setTitle('The Bulgaria We Lost API')
      .setVersion('1')
      .addBearerAuth()
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          description: 'Private rotated credential used by the .NET media API.',
        },
        'serviceToken',
      )
      .addGlobalParameters({
        name: CORRELATION_ID_HEADER,
        in: 'header',
        required: false,
        description:
          'Optional request correlation ID. The same value is returned in the response header and Problem Details traceId.',
        schema: { type: 'string', maxLength: 128 },
      })
      .build();
    SwaggerModule.setup('docs', app, () =>
      SwaggerModule.createDocument(app, docs),
    );
  }

  await app.listen(config.getOrThrow('app.port', { infer: true }));
}

void bootstrap();
