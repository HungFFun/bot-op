import { z } from 'zod';

export const USER_ROLES = ['staff', 'manager', 'accountant', 'owner'] as const;
export const userRoleSchema = z.enum(USER_ROLES);
export type UserRole = z.infer<typeof userRoleSchema>;

export const ROLE_LABELS: Record<UserRole, string> = {
  staff: 'Nhân viên',
  manager: 'Quản lý',
  accountant: 'Kế toán',
  owner: 'Chủ',
};

export const uuidSchema = z.uuid({ error: 'ID không hợp lệ' });

/** Vietnamese mobile number: 10 digits starting with 0. Spaces, dots, dashes are stripped; +84 becomes 0. */
export const phoneSchema = z
  .string({ error: 'Vui lòng nhập số điện thoại' })
  .trim()
  .transform((v) => v.replace(/[\s.-]/g, '').replace(/^\+?84/, '0'))
  .pipe(z.string().regex(/^0\d{9}$/, { error: 'Số điện thoại không hợp lệ' }));

/** Login name: lowercase letters, digits, dot, dash, underscore. Case-insensitive (stored lowercase). */
export const usernameSchema = z
  .string({ error: 'Vui lòng nhập tên đăng nhập' })
  .trim()
  .toLowerCase()
  .min(3, { error: 'Tên đăng nhập tối thiểu 3 ký tự' })
  .max(32, { error: 'Tên đăng nhập tối đa 32 ký tự' })
  .regex(/^[a-z0-9._-]+$/, {
    error: 'Tên đăng nhập chỉ gồm chữ không dấu, số, dấu chấm, gạch ngang',
  });

export const PASSWORD_MIN_LENGTH = 6;

/** New password set by an admin. */
export const passwordSchema = z
  .string({ error: 'Vui lòng nhập mật khẩu' })
  .min(PASSWORD_MIN_LENGTH, { error: `Mật khẩu tối thiểu ${PASSWORD_MIN_LENGTH} ký tự` })
  .max(72, { error: 'Mật khẩu tối đa 72 ký tự' });

export const loginBodySchema = z.object({
  username: z
    .string({ error: 'Vui lòng nhập tên đăng nhập' })
    .trim()
    .toLowerCase()
    .min(1, { error: 'Vui lòng nhập tên đăng nhập' }),
  // Only presence is checked at login; strength rules apply when a password is set.
  password: z
    .string({ error: 'Vui lòng nhập mật khẩu' })
    .min(1, { error: 'Vui lòng nhập mật khẩu' }),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

export const branchSchema = z.object({ id: z.string(), code: z.string(), name: z.string() });
export type BranchRef = z.infer<typeof branchSchema>;

export const meSchema = z.object({
  id: z.string(),
  username: z.string(),
  name: z.string(),
  role: userRoleSchema,
  branch: branchSchema.nullable(),
});
export type Me = z.infer<typeof meSchema>;

/** Roles that must belong to one branch; the others (owner, accountant) see all branches. */
export const BRANCH_SCOPED_ROLES = ['staff', 'manager'] as const satisfies readonly UserRole[];

const optionalPhone = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .pipe(phoneSchema.nullable())
  .nullish();

const userFields = {
  name: z
    .string({ error: 'Vui lòng nhập họ tên' })
    .trim()
    .min(1, { error: 'Vui lòng nhập họ tên' })
    .max(100),
  role: userRoleSchema,
  branchId: uuidSchema.nullish(),
  phone: optionalPhone,
};

const requireBranchForScopedRoles = <T extends { role?: UserRole; branchId?: string | null }>(
  v: T,
  ctx: z.RefinementCtx,
) => {
  if (v.role && (BRANCH_SCOPED_ROLES as readonly string[]).includes(v.role) && !v.branchId) {
    ctx.addIssue({
      code: 'custom',
      path: ['branchId'],
      message: 'Nhân viên và quản lý phải thuộc một chi nhánh',
    });
  }
};

/** Admin creates an account. */
export const userCreateSchema = z
  .object({ username: usernameSchema, password: passwordSchema, ...userFields })
  .superRefine(requireBranchForScopedRoles);
export type UserCreateInput = z.input<typeof userCreateSchema>;

/** Admin edits an account. Role and branch are validated together on the server against the stored values. */
export const userUpdateSchema = z.object({
  name: userFields.name.optional(),
  role: userRoleSchema.optional(),
  branchId: uuidSchema.nullish(),
  phone: optionalPhone,
  active: z.boolean().optional(),
});
export type UserUpdateInput = z.input<typeof userUpdateSchema>;

export const passwordResetSchema = z.object({ password: passwordSchema });

export type UserListItem = {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  phone: string | null;
  active: boolean;
  branch: BranchRef | null;
  lockedUntil: string | null;
};

/** Error body returned by every API error. `message` is user-facing Vietnamese. */
export const apiErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  /** Per-row errors from file imports; row numbers match the spreadsheet (header = row 1). */
  rowErrors: z.array(z.object({ row: z.number(), message: z.string() })).optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
