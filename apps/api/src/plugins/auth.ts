import { branches, sessions, users } from '@bot-op/db';
import type { UserRole } from '@bot-op/shared';
import { and, eq, gt } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { hashSessionToken, SESSION_COOKIE, SESSION_TOUCH_MS, SESSION_TTL_MS } from '../lib/session';

export type AuthUser = {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  /** null = all branches. */
  branchId: string | null;
  branch: { id: string; code: string; name: string } | null;
  sessionId: string;
};

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
  }
  interface FastifyInstance {
    setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date): void;
  }
}

export default fp<{ sessionSecret: string; cookieSecure: boolean }>(async (app, opts) => {
  app.decorateRequest('user', null);

  app.decorate('setSessionCookie', (reply: FastifyReply, token: string, expiresAt: Date) => {
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      secure: opts.cookieSecure,
      sameSite: 'lax',
      expires: expiresAt,
    });
  });

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return;

    const [row] = await app.db
      .select({
        sessionId: sessions.id,
        lastSeenAt: sessions.lastSeenAt,
        id: users.id,
        username: users.username,
        name: users.name,
        role: users.role,
        branchId: users.branchId,
        branchCode: branches.code,
        branchName: branches.name,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .leftJoin(branches, eq(branches.id, users.branchId))
      .where(
        and(
          eq(sessions.tokenHash, hashSessionToken(token, opts.sessionSecret)),
          gt(sessions.expiresAt, new Date()),
          eq(users.active, true),
        ),
      )
      .limit(1);
    if (!row) return;

    req.user = {
      id: row.id,
      username: row.username,
      name: row.name,
      role: row.role,
      branchId: row.branchId,
      branch:
        row.branchId && row.branchCode && row.branchName
          ? { id: row.branchId, code: row.branchCode, name: row.branchName }
          : null,
      sessionId: row.sessionId,
    };

    // Sliding expiry: an active user stays logged in.
    if (Date.now() - row.lastSeenAt.getTime() > SESSION_TOUCH_MS) {
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
      await app.db
        .update(sessions)
        .set({ lastSeenAt: new Date(), expiresAt })
        .where(eq(sessions.id, row.sessionId));
      app.setSessionCookie(reply, token, expiresAt);
    }
  });
});
