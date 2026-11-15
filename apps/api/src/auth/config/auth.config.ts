import { Logger } from '@nestjs/common';
import { registerAs } from '@nestjs/config';
import { IsNotEmpty, IsString, Matches } from 'class-validator';
import type { StringValue } from 'ms';
import validateConfig from '../../utils/validate-config';
import type { AuthConfig } from './auth-config.type';

const sampleSecrets = [
  'secret',
  'secret_for_refresh',
  'secret_for_forgot',
  'secret_for_confirm_email',
];
const duration = /^[1-9]\d{0,5}[smhd]$/;

class AuthEnvironment {
  @IsString()
  @IsNotEmpty()
  AUTH_JWT_SECRET: string;

  @IsString()
  @IsNotEmpty()
  AUTH_REFRESH_SECRET: string;

  @IsString()
  @IsNotEmpty()
  AUTH_FORGOT_SECRET: string;

  @IsString()
  @IsNotEmpty()
  AUTH_CONFIRM_EMAIL_SECRET: string;

  @Matches(duration)
  AUTH_JWT_TOKEN_EXPIRES_IN: StringValue;

  @Matches(duration)
  AUTH_REFRESH_TOKEN_EXPIRES_IN: StringValue;

  @Matches(duration)
  AUTH_FORGOT_TOKEN_EXPIRES_IN: StringValue;

  @Matches(duration)
  AUTH_CONFIRM_EMAIL_TOKEN_EXPIRES_IN: StringValue;
}

export default registerAs<AuthConfig>('auth', () => {
  const env = validateConfig(process.env, AuthEnvironment);
  const secrets = [
    env.AUTH_JWT_SECRET,
    env.AUTH_REFRESH_SECRET,
    env.AUTH_FORGOT_SECRET,
    env.AUTH_CONFIRM_EMAIL_SECRET,
  ];
  if (new Set(secrets).size !== secrets.length)
    throw new Error('Configure four distinct auth secrets.');
  const weak = secrets.some(
    (value) => sampleSecrets.includes(value) || Buffer.byteLength(value) < 32,
  );
  if (weak && process.env.NODE_ENV === 'production') {
    throw new Error(
      'Configure four strong auth secrets before running in production.',
    );
  }
  if (weak) new Logger('AuthConfig').warn('Using development auth secrets.');

  return {
    secret: env.AUTH_JWT_SECRET,
    expires: env.AUTH_JWT_TOKEN_EXPIRES_IN,
    refreshSecret: env.AUTH_REFRESH_SECRET,
    refreshExpires: env.AUTH_REFRESH_TOKEN_EXPIRES_IN,
    forgotSecret: env.AUTH_FORGOT_SECRET,
    forgotExpires: env.AUTH_FORGOT_TOKEN_EXPIRES_IN,
    confirmEmailSecret: env.AUTH_CONFIRM_EMAIL_SECRET,
    confirmEmailExpires: env.AUTH_CONFIRM_EMAIL_TOKEN_EXPIRES_IN,
  };
});
