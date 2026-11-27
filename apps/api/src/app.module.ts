import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { HeaderResolver, I18nModule } from 'nestjs-i18n';
import { join } from 'node:path';
import authConfig from './auth/config/auth.config';
import { AuthModule } from './auth/auth.module';
import { BackOfficeModule } from './back-office/back-office.module';
import { CatalogModule } from './catalog/catalog.module';
import appConfig from './config/app.config';
import type { AllConfigType } from './config/config.type';
import databaseConfig from './database/database.config';
import { DiscoveryModule } from './discovery/discovery.module';
import { HealthController } from './health/health.controller';
import mailConfig from './mail/config/mail.config';
import mediaConfig from './media/config/media.config';
import { MediaModule } from './media/media.module';
import { PublishingModule } from './publishing/publishing.module';
import { ModerationModule } from './moderation/moderation.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, authConfig, databaseConfig, mailConfig, mediaConfig],
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AllConfigType>) => ({
        uri: config.getOrThrow('database.url', { infer: true }),
        serverSelectionTimeoutMS: 5_000,
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    I18nModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AllConfigType>) => ({
        fallbackLanguage: config.getOrThrow('app.fallbackLanguage', {
          infer: true,
        }),
        loaderOptions: { path: join(__dirname, 'i18n') },
      }),
      resolvers: [new HeaderResolver(['accept-language'])],
    }),
    AuthModule,
    BackOfficeModule,
    MediaModule,
    PublishingModule,
    DiscoveryModule,
    ModerationModule,
    CatalogModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
