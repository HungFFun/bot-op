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

export const pinSchema = z
  .string({ error: 'Vui lòng nhập PIN' })
  .regex(/^\d{6}$/, { error: 'PIN gồm đúng 6 chữ số' });

export const loginBodySchema = z.object({
  phone: phoneSchema,
  pin: pinSchema,
});
export type LoginBody = z.infer<typeof loginBodySchema>;

export const meSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string(),
  role: userRoleSchema,
  branch: z.object({ id: z.string(), code: z.string(), name: z.string() }).nullable(),
});
export type Me = z.infer<typeof meSchema>;

/** Error body returned by every API error. `message` is user-facing Vietnamese. */
export const apiErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
