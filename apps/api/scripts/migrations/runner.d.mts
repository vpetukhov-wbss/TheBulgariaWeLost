import type { ClientSession, Db } from 'mongodb';

export interface Migration {
  id: string;
  version: number;
  description: string;
  signature: string;
  indexes?: Array<{
    collection: string;
    key: Record<string, number>;
    options: Record<string, unknown> & { name: string };
  }>;
  up(context: { database: Db; session: ClientSession }): Promise<void>;
}

export interface MigrationResult {
  database: string;
  applied: string[];
  skipped: string[];
}

export function runMigrations(options?: {
  databaseUrl?: string;
  migrations?: Migration[];
  logger?: (message: string) => void;
}): Promise<MigrationResult>;
