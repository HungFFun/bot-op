import { loadRootEnv, requireEnv, runMigrations } from '@bot-op/db';
import postgres from 'postgres';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  interface ProvidedContext {
    databaseUrl: string;
  }
}

/** Creates `<db>_test` next to the dev database and migrates it. */
export default async function setup(project: TestProject) {
  loadRootEnv();
  const devUrl = new URL(requireEnv('DATABASE_URL'));
  const testDbName = `${devUrl.pathname.slice(1)}_test`;
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
  project.provide('databaseUrl', testUrl.toString());
}
