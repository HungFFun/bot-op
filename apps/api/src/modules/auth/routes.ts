import { hashPassword, sessions, users, verifyPassword } from '@bot-op/db';
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

// Verified against when the username is unknown, so response time does not reveal which accounts exist.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword('not-a-real-password'));

const invalidCredentials = () =>
  new AppError(401, 'invalid_credentials', 'Tên đăng nhập hoặc mật khẩu không đúng');

const locked = (until: Date) => {
  const minutes = Math.min(
    LOCK_MINUTES,
    Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000)),
  );
  return new AppError(
    423,
    'locked',
    `Tài khoản tạm khoá do nhập sai mật khẩu nhiều lần. Thử lại sau ${minutes} phút.`,
  );
};

export const authRoutes: FastifyPluginAsync<{ sessionSecret: string }> = async (app, opts) => {
  app.post('/auth/login', async (req, reply) => {
    const { username, password } = loginBodySchema.parse(req.body);
    const user = await app.db.query.users.findFirst({ where: eq(users.username, username) });

    if (!user || !user.active) {
      await verifyPassword(await getDummyHash(), password);
      throw invalidCredentials();
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) throw locked(user.lockedUntil);

    if (!(await verifyPassword(user.passwordHash, password))) {
      // Lock end is computed here, not with the DB's now(), so the minutes shown use one clock.
      const lockUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
      // Atomic so concurrent attempts cannot bypass the limit.
      const [updated] = await app.db
        .update(users)
        .set({
          failedAttempts: sql`case when ${users.failedAttempts} + 1 >= ${MAX_FAILED_ATTEMPTS} then 0 else ${users.failedAttempts} + 1 end`,
          lockedUntil: sql`case when ${users.failedAttempts} + 1 >= ${MAX_FAILED_ATTEMPTS} then ${lockUntil.toISOString()}::timestamptz else ${users.lockedUntil} end`,
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
    const { id, username, name, role, branch } = currentUser(req);
    return { id, username, name, role, branch };
  });
};
