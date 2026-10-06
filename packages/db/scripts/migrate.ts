import { loadRootEnv, requireEnv } from '../src/env';
import { runMigrations } from '../src/migrate';

loadRootEnv();
await runMigrations(requireEnv('DATABASE_URL'));
console.log('Migrations applied');
