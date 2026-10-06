import type { UserRole } from '@bot-op/shared';
import type { FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import fp from 'fastify-plugin';
import { forbidden, unauthorized } from '../lib/errors';
import type { AuthUser } from './auth';

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: preHandlerAsyncHookHandler;
    requireRole(...roles: UserRole[]): preHandlerAsyncHookHandler;
  }
}

/** Returns the authenticated user or throws 401. Use inside handlers guarded by requireAuth. */
export function currentUser(req: FastifyRequest): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

/** Owner and accountant (branchId null) see every branch; others only their own. */
export function canAccessBranch(user: Pick<AuthUser, 'branchId'>, branchId: string): boolean {
  return user.branchId === null || user.branchId === branchId;
}

export default fp(async (app) => {
  app.decorate('requireAuth', async (req: FastifyRequest) => {
    if (!req.user) throw unauthorized();
  });

  app.decorate('requireRole', (...roles: UserRole[]) => async (req: FastifyRequest) => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) throw forbidden();
  });
});
