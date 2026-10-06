import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Loads the repo-root .env in local dev. In Docker, variables come from compose and no file exists. */
export function loadRootEnv(): void {
  const path = fileURLToPath(new URL('../../../.env', import.meta.url));
  if (existsSync(path)) process.loadEnvFile(path);
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}
