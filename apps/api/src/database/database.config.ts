import { registerAs } from '@nestjs/config';

export type DatabaseConfig = { url: string };

export default registerAs<DatabaseConfig>('database', () => {
  const url = process.env.DATABASE_URL;
  if (!url || !/^mongodb(?:\+srv)?:\/\//.test(url)) {
    throw new Error('DATABASE_URL must be a MongoDB connection string.');
  }
  return { url };
});
