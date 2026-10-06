import cookie from '@fastify/cookie';
import Fastify, { type FastifyServerOptions } from 'fastify';
import type { Config } from './config';
import { authRoutes } from './modules/auth/routes';
import { healthRoutes } from './modules/health/routes';
import auth from './plugins/auth';
import db from './plugins/db';
import error from './plugins/error';
import rbac from './plugins/rbac';

export async function buildApp(
  config: Pick<Config, 'databaseUrl' | 'sessionSecret' | 'cookieSecure'>,
  opts: FastifyServerOptions = {},
) {
  const app = Fastify({ trustProxy: true, ...opts });

  await app.register(error);
  await app.register(cookie);
  await app.register(db, { url: config.databaseUrl });
  await app.register(auth, {
    sessionSecret: config.sessionSecret,
    cookieSecure: config.cookieSecure,
  });
  await app.register(rbac);

  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(authRoutes, { sessionSecret: config.sessionSecret });
    },
    { prefix: '/api' },
  );

  return app;
}
