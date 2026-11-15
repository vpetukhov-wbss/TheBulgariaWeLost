import { registerAs } from '@nestjs/config';
import { IsEnum, IsInt, IsOptional, IsUrl, Max, Min } from 'class-validator';
import validateConfig from '../utils/validate-config';
import type { AppConfig } from './app-config.type';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariablesValidator {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment;

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  APP_PORT: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  APP_TRUST_PROXY_HOPS: number;

  @IsUrl({
    require_tld: false,
    require_protocol: true,
    protocols: ['http', 'https'],
  })
  FRONTEND_DOMAIN: string;
}

export default registerAs<AppConfig>('app', () => {
  const env = validateConfig(process.env, EnvironmentVariablesValidator);
  const frontendDomain = env.FRONTEND_DOMAIN.replace(/\/$/, '');
  return {
    nodeEnv: env.NODE_ENV ?? Environment.Development,
    name: process.env.APP_NAME || 'The Bulgaria We Lost',
    frontendDomain,
    corsOrigins: (
      process.env.APP_CORS_ORIGINS || new URL(frontendDomain).origin
    )
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    port: env.APP_PORT ?? 3000,
    fallbackLanguage: 'en',
    trustProxyHops: env.APP_TRUST_PROXY_HOPS ?? 0,
  };
});
