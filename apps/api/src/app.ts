import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyServerOptions } from 'fastify';
import type { QueueSender } from '@bot-op/db';
import type { Config } from './config';
import { attachmentRoutes } from './modules/attachments/routes';
import { authRoutes } from './modules/auth/routes';
import { branchRoutes } from './modules/branches/routes';
import { categoryRoutes } from './modules/categories/routes';
import { healthRoutes } from './modules/health/routes';
import { ingredientRoutes } from './modules/ingredients/routes';
import { orderRoutes } from './modules/purchase-orders/routes';
import { pushRoutes } from './modules/push/routes';
import { supplierRoutes } from './modules/suppliers/routes';
import { userRoutes } from './modules/users/routes';
import auth from './plugins/auth';
import db from './plugins/db';
import error from './plugins/error';
import queue from './plugins/queue';
import rbac from './plugins/rbac';

export async function buildApp(
  config: Pick<Config, 'databaseUrl' | 'sessionSecret' | 'cookieSecure' | 'uploadDir'> &
    Partial<Pick<Config, 'vapidPublicKey'>> & {
      /** Inject a queue (tests); otherwise pg-boss is started. */
      queue?: QueueSender;
    },
  opts: FastifyServerOptions = {},
) {
  const app = Fastify({ trustProxy: true, ...opts });

  await app.register(error);
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
  await app.register(db, { url: config.databaseUrl });
  await app.register(queue, { url: config.databaseUrl, queue: config.queue });
  await app.register(auth, {
    sessionSecret: config.sessionSecret,
    cookieSecure: config.cookieSecure,
  });
  await app.register(rbac);

  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(authRoutes, { sessionSecret: config.sessionSecret });
      await api.register(branchRoutes);
      await api.register(userRoutes);
      await api.register(categoryRoutes);
      await api.register(supplierRoutes);
      await api.register(ingredientRoutes);
      await api.register(orderRoutes);
      await api.register(pushRoutes, { vapidPublicKey: config.vapidPublicKey ?? null });
      await api.register(attachmentRoutes, { uploadDir: config.uploadDir });
    },
    { prefix: '/api' },
  );

  return app;
}
