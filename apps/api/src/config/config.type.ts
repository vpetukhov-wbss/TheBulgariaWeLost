import type { AuthConfig } from '../auth/config/auth-config.type';
import type { MailConfig } from '../mail/config/mail-config.type';
import type { MediaConfig } from '../media/config/media-config.type';
import type { AppConfig } from './app-config.type';
import type { DatabaseConfig } from '../database/database.config';

export type AllConfigType = {
  app: AppConfig;
  auth: AuthConfig;
  database: DatabaseConfig;
  mail: MailConfig;
  media: MediaConfig;
};
