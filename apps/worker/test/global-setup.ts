import { prepareTestDatabase } from '@bot-op/db';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  interface ProvidedContext {
    databaseUrl: string;
  }
}

export default async function setup(project: TestProject) {
  project.provide('databaseUrl', await prepareTestDatabase('test_worker'));
}
