import { branches, hashPassword, sessions, users } from '@bot-op/db';
import {
  BRANCH_SCOPED_ROLES,
  passwordResetSchema,
  userCreateSchema,
  userUpdateSchema,
  uuidSchema,
  type UserListItem,
} from '@bot-op/shared';
import { asc, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { diffFields, writeAudit } from '../../lib/audit';
import {
  AppError,
  conflict,
  isForeignKeyViolation,
  isUniqueViolation,
  notFound,
} from '../../lib/errors';
import { currentUser } from '../../plugins/rbac';

const idParams = z.object({ id: uuidSchema });

const columns = {
  id: users.id,
  username: users.username,
  name: users.name,
  role: users.role,
  phone: users.phone,
  active: users.active,
  lockedUntil: users.lockedUntil,
  branchId: branches.id,
  branchCode: branches.code,
  branchName: branches.name,
};

type Row = {
  id: string;
  username: string;
  name: string;
  role: UserListItem['role'];
  phone: string | null;
  active: boolean;
  lockedUntil: Date | null;
  branchId: string | null;
  branchCode: string | null;
  branchName: string | null;
};

const toItem = ({ branchId, branchCode, branchName, lockedUntil, ...u }: Row): UserListItem => ({
  ...u,
  lockedUntil: lockedUntil && lockedUntil > new Date() ? lockedUntil.toISOString() : null,
  branch:
    branchId && branchCode && branchName
      ? { id: branchId, code: branchCode, name: branchName }
      : null,
});

const isBranchScoped = (role: string) => (BRANCH_SCOPED_ROLES as readonly string[]).includes(role);

function mapWriteError(err: unknown): never {
  if (isUniqueViolation(err)) throw conflict('Tên đăng nhập đã tồn tại');
  if (isForeignKeyViolation(err))
    throw new AppError(400, 'invalid_reference', 'Chi nhánh không tồn tại');
  throw err;
}

/** Accounts are issued by the admin (owner role) only. Users cannot sign up. */
export const userRoutes: FastifyPluginAsync = async (app) => {
  const adminOnly = app.requireRole('owner');

  const findUser = async (id: string) => {
    const [row] = await app.db
      .select(columns)
      .from(users)
      .leftJoin(branches, eq(branches.id, users.branchId))
      .where(eq(users.id, id));
    return row ? toItem(row) : undefined;
  };

  app.get('/users', { preHandler: adminOnly }, async (): Promise<UserListItem[]> => {
    const rows = await app.db
      .select(columns)
      .from(users)
      .leftJoin(branches, eq(branches.id, users.branchId))
      .orderBy(desc(users.active), asc(users.name));
    return rows.map(toItem);
  });

  app.post('/users', { preHandler: adminOnly }, async (req, reply) => {
    const { password, ...input } = userCreateSchema.parse(req.body);
    const admin = currentUser(req);
    const branchId = isBranchScoped(input.role) ? input.branchId : null;
    try {
      const id = await app.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(users)
          .values({ ...input, branchId, passwordHash: await hashPassword(password) })
          .returning({ id: users.id });
        await writeAudit(tx, {
          userId: admin.id,
          action: 'create',
          entity: 'users',
          entityId: row!.id,
          diff: { ...input, branchId },
        });
        return row!.id;
      });
      return reply.status(201).send(await findUser(id));
    } catch (err) {
      mapWriteError(err);
    }
  });

  app.patch('/users/:id', { preHandler: adminOnly }, async (req): Promise<UserListItem> => {
    const { id } = idParams.parse(req.params);
    const patch = userUpdateSchema.parse(req.body);
    const admin = currentUser(req);

    if (id === admin.id && (patch.active === false || (patch.role && patch.role !== 'owner'))) {
      throw new AppError(
        400,
        'self_lockout',
        'Không thể tự khoá hoặc tự bỏ quyền admin của chính mình',
      );
    }

    try {
      await app.db.transaction(async (tx) => {
        const before = await tx.query.users.findFirst({ where: eq(users.id, id) });
        if (!before) throw notFound('Tài khoản');

        const role = patch.role ?? before.role;
        let branchId = patch.branchId === undefined ? before.branchId : patch.branchId;
        if (!isBranchScoped(role)) branchId = null;
        else if (!branchId) {
          throw new AppError(
            400,
            'branch_required',
            'Nhân viên và quản lý phải thuộc một chi nhánh',
          );
        }

        const changes = { ...patch, role, branchId };
        await tx.update(users).set(changes).where(eq(users.id, id));
        // Deactivation takes effect immediately.
        if (patch.active === false) await tx.delete(sessions).where(eq(sessions.userId, id));
        await writeAudit(tx, {
          userId: admin.id,
          action: 'update',
          entity: 'users',
          entityId: id,
          diff: diffFields(before, changes),
        });
      });
    } catch (err) {
      mapWriteError(err);
    }
    return (await findUser(id))!;
  });

  /** Sets a new password, unlocks the account and signs the user out everywhere. */
  app.post('/users/:id/password', { preHandler: adminOnly }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const { password } = passwordResetSchema.parse(req.body);
    const admin = currentUser(req);
    await app.db.transaction(async (tx) => {
      const [row] = await tx
        .update(users)
        .set({ passwordHash: await hashPassword(password), failedAttempts: 0, lockedUntil: null })
        .where(eq(users.id, id))
        .returning({ id: users.id });
      if (!row) throw notFound('Tài khoản');
      if (id !== admin.id) await tx.delete(sessions).where(eq(sessions.userId, id));
      await writeAudit(tx, {
        userId: admin.id,
        action: 'password_reset',
        entity: 'users',
        entityId: id,
      });
    });
    return reply.status(204).send();
  });
};
