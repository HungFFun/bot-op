import { hashPin, sessions, users, verifyPin } from '@bot-op/db';
import { loginBodySchema, type Me } from '@bot-op/shared';
import { eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../lib/errors';
import {
  hashSessionToken,
  newSessionToken,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from '../../lib/session';
import { currentUser } from '../../plugins/rbac';

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

// Verified against when the phone is unknown, so response time does not reveal which phones exist.
let dummyPinHash: Promise<string> | undefined;
const getDummyPinHash = () => (dummyPinHash ??= hashPin('000000'));

const invalidCredentials = () =>
  new AppError(401, 'invalid_credentials', 'Số điện thoại hoặc PIN không đúng');

const locked = (until: Date) => {
  const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
  return new AppError(
    423,
    'locked',
    `Tài khoản tạm khoá do nhập sai PIN nhiều lần. Thử lại sau ${minutes} phút.`,
  );
};

export const authRoutes: FastifyPluginAsync<{ sessionSecret: string }> = async (app, opts) => {
  app.post('/auth/login', async (req, reply) => {
    const { phone, pin } = loginBodySchema.parse(req.body);
    const user = await app.db.query.users.findFirst({ where: eq(users.phone, phone) });

    if (!user || !user.active) {
      await verifyPin(await getDummyPinHash(), pin);
      throw invalidCredentials();
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) throw locked(user.lockedUntil);

    if (!(await verifyPin(user.pinHash, pin))) {
      // Atomic so concurrent attempts cannot bypass the limit.
      const [updated] = await app.db
        .update(users)
        .set({
          failedAttempts: sql`case when ${users.failedAttempts} + 1 >= ${MAX_FAILED_ATTEMPTS} then 0 else ${users.failedAttempts} + 1 end`,
          lockedUntil: sql`case when ${users.failedAttempts} + 1 >= ${MAX_FAILED_ATTEMPTS} then now() + make_interval(mins => ${LOCK_MINUTES}) else ${users.lockedUntil} end`,
        })
        .where(eq(users.id, user.id))
        .returning({ lockedUntil: users.lockedUntil });
      if (updated?.lockedUntil && updated.lockedUntil > new Date()) {
        throw locked(updated.lockedUntil);
      }
      throw invalidCredentials();
    }

    if (user.failedAttempts > 0 || user.lockedUntil) {
      await app.db
        .update(users)
        .set({ failedAttempts: 0, lockedUntil: null })
        .where(eq(users.id, user.id));
    }

    const token = newSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await app.db.insert(sessions).values({
      userId: user.id,
      tokenHash: hashSessionToken(token, opts.sessionSecret),
      device: req.headers['user-agent']?.slice(0, 200) ?? null,
      expiresAt,
    });
    app.setSessionCookie(reply, token, expiresAt);
    return { ok: true };
  });

  app.post('/auth/logout', async (req, reply) => {
    if (req.user) {
      await app.db.delete(sessions).where(eq(sessions.id, req.user.sessionId));
    }
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/auth/me', { preHandler: app.requireAuth }, async (req): Promise<Me> => {
    const { id, name, phone, role, branch } = currentUser(req);
    return { id, name, phone, role, branch };
  });
};
