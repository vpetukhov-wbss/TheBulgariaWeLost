import 'dotenv/config';
import { runMigrations } from './migrations/runner.mjs';

runMigrations().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'MongoDB migration failed.'}\n`,
  );
  process.exitCode = 1;
});
