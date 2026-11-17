import type { StringValue } from 'ms';

export type AuthConfig = {
  secret: string;
  expires: StringValue;
  refreshSecret: string;
  refreshExpires: StringValue;
  forgotSecret: string;
  forgotExpires: StringValue;
  confirmEmailSecret: string;
  confirmEmailExpires: StringValue;
  mfaEncryptionKey: string;
  mfaVerifiedMaxAgeMs: number;
};
