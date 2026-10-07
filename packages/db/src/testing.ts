import postgres from 'postgres';
import { loadRootEnv, requireEnv } from './env';
import { runMigrations } from './migrate';

/**
 * Creates `<db>_<suffix>` next to the dev database, migrates it and returns its URL. Each package
 * that tests against Postgres uses its own suffix: `pnpm test` runs packages in parallel.
 */
export async function prepareTestDatabase(suffix = 'test'): Promise<string> {
  loadRootEnv();
  const devUrl = new URL(requireEnv('DATABASE_URL'));
  const testDbName = `${devUrl.pathname.slice(1)}_${suffix}`;
  const testUrl = new URL(devUrl);
  testUrl.pathname = `/${testDbName}`;

  const admin = postgres(devUrl.toString(), { max: 1, onnotice: () => {} });
  try {
    const [exists] = await admin`select 1 from pg_database where datname = ${testDbName}`;
    if (!exists) await admin.unsafe(`create database "${testDbName}"`);
  } finally {
    await admin.end();
  }
  await runMigrations(testUrl.toString());
  return testUrl.toString();
}
