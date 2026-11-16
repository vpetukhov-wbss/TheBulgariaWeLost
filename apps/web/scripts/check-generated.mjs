import { spawnSync } from 'node:child_process';
import process from 'node:process';

const path = 'src/app/api/generated';
const diff = spawnSync('git', ['diff', '--exit-code', '--', path], {
  stdio: 'inherit',
});
const untracked = spawnSync('git', ['ls-files', '--others', '--exclude-standard', '--', path], {
  encoding: 'utf8',
});

if (diff.status !== 0 || untracked.status !== 0 || untracked.stdout.trim()) {
  if (untracked.stdout.trim()) console.error(`Untracked generated files:\n${untracked.stdout}`);
  console.error('The Angular API client is stale. Run npm run api:generate and commit the result.');
  process.exitCode = 1;
} else {
  console.log('The generated Angular API client is current.');
}
