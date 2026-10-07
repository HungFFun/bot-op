import {
  BRANCH_SCOPED_ROLES,
  passwordSchema,
  ROLE_LABELS,
  USER_ROLES,
  userCreateSchema,
  userUpdateSchema,
  type UserListItem,
  type UserRole,
} from '@bot-op/shared';
import { useState, type FormEvent } from 'react';
import { Button, Empty, ErrorText, Field, Input, PageHeader, Select } from '../../components/ui';
import { useMe } from '../../features/auth/queries';
import {
  useBranches,
  useCreateUser,
  useResetPassword,
  useUpdateUser,
  useUsers,
} from '../../features/users/queries';

const isBranchScoped = (role: UserRole) =>
  (BRANCH_SCOPED_ROLES as readonly string[]).includes(role);

export function UsersPage() {
  const users = useUsers();
  const [editing, setEditing] = useState<UserListItem | 'new' | null>(null);

  if (editing) {
    return (
      <UserForm
        key={editing === 'new' ? 'new' : editing.id}
        initial={editing === 'new' ? undefined : editing}
        onDone={() => setEditing(null)}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Tài khoản"
        back="/admin"
        action={
          <Button onClick={() => setEditing('new')} className="!py-2">
            + Cấp tài khoản
          </Button>
        }
      />
      <ErrorText error={users.error} />
      {users.data?.length === 0 && <Empty>Chưa có tài khoản nào.</Empty>}
      <ul className="divide-y divide-line">
        {users.data?.map((u) => (
          <li key={u.id}>
            <button
              className="block w-full py-2.5 text-left active:bg-cream"
              onClick={() => setEditing(u)}
            >
              <div className="flex items-baseline gap-2">
                <span className={`font-semibold ${u.active ? '' : 'text-ink-muted line-through'}`}>
                  {u.name}
                </span>
                <span className="font-mono text-sm text-ink-muted">{u.username}</span>
              </div>
              <div className="text-sm text-ink-muted">
                {ROLE_LABELS[u.role]}
                {u.branch ? ` · ${u.branch.code}` : ' · Mọi chi nhánh'}
                {!u.active && ' · Đã khoá'}
                {u.lockedUntil && (
                  <span className="font-semibold text-chili-strong">
                    {' '}
                    · Tạm khoá do sai mật khẩu
                  </span>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UserForm({ initial, onDone }: { initial?: UserListItem; onDone: () => void }) {
  const { data: me } = useMe();
  const branches = useBranches();
  const create = useCreateUser();
  const update = useUpdateUser();
  const isSelf = initial?.id === me?.id;
  const [form, setForm] = useState({
    username: initial?.username ?? '',
    password: '',
    name: initial?.name ?? '',
    role: (initial?.role ?? 'staff') as UserRole,
    branchId: initial?.branch?.id ?? '',
    phone: initial?.phone ?? '',
    active: initial?.active ?? true,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [k]: value }));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const common = {
      name: form.name,
      role: form.role,
      branchId: isBranchScoped(form.role) ? form.branchId || null : null,
      phone: form.phone,
    };
    const parsed = initial
      ? userUpdateSchema.safeParse({ ...common, active: form.active })
      : userCreateSchema.safeParse({ ...common, username: form.username, password: form.password });
    if (!parsed.success)
      return setFormError(parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ');
    setFormError(null);
    if (initial)
      update.mutate({ ...common, active: form.active, id: initial.id }, { onSuccess: onDone });
    else
      create.mutate(
        { ...common, username: form.username, password: form.password },
        { onSuccess: onDone },
      );
  };

  const saving = create.isPending || update.isPending;

  return (
    <div>
      <form onSubmit={onSubmit} className="grid gap-3">
        <PageHeader title={initial ? `Sửa tài khoản` : 'Cấp tài khoản mới'} />
        {initial ? (
          <p className="rounded-xl bg-cream px-3 py-2 text-sm">
            Tên đăng nhập: <span className="font-mono font-semibold">{initial.username}</span>
          </p>
        ) : (
          <>
            <Field
              label="Tên đăng nhập"
              hint="Chữ không dấu, số, dấu chấm hoặc gạch ngang. Không đổi được sau khi tạo."
            >
              <Input
                value={form.username}
                onChange={set('username')}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </Field>
            <Field label="Mật khẩu" hint="Tối thiểu 6 ký tự. Gửi cho nhân viên qua kênh riêng.">
              <Input value={form.password} onChange={set('password')} autoComplete="new-password" />
            </Field>
          </>
        )}
        <Field label="Họ tên">
          <Input value={form.name} onChange={set('name')} />
        </Field>
        <Field label="Vai trò">
          <Select value={form.role} onChange={set('role')} disabled={isSelf}>
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
                {r === 'owner' ? ' (admin)' : ''}
              </option>
            ))}
          </Select>
        </Field>
        {isBranchScoped(form.role) && (
          <Field label="Chi nhánh">
            <Select value={form.branchId} onChange={set('branchId')}>
              <option value="">Chọn chi nhánh…</option>
              {branches.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} · {b.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Số điện thoại (liên hệ)">
          <Input
            value={form.phone}
            onChange={set('phone')}
            type="tel"
            placeholder="Không bắt buộc"
          />
        </Field>
        {initial && !isSelf && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => {
                const active = e.target.checked;
                setForm((f) => ({ ...f, active }));
              }}
            />
            Cho phép đăng nhập (bỏ chọn để khoá tài khoản)
          </label>
        )}
        <ErrorText error={formError ? { message: formError } : (create.error ?? update.error)} />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onDone}>
            Huỷ
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Đang lưu…' : initial ? 'Lưu' : 'Cấp tài khoản'}
          </Button>
        </div>
      </form>
      {initial && <ResetPassword user={initial} />}
    </div>
  );
}

function ResetPassword({ user }: { user: UserListItem }) {
  const reset = useResetPassword();
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success)
      return setFormError(parsed.error.issues[0]?.message ?? 'Mật khẩu không hợp lệ');
    setFormError(null);
    reset.mutate({ id: user.id, password }, { onSuccess: () => setPassword('') });
  };

  return (
    <form onSubmit={onSubmit} className="mt-6 grid gap-2 rounded-2xl bg-cream p-3">
      <h2 className="font-bold">Đặt lại mật khẩu</h2>
      <p className="text-sm text-ink-muted">
        Tài khoản sẽ bị đăng xuất khỏi mọi thiết bị và được mở khoá nếu đang bị tạm khoá.
      </p>
      <div className="flex gap-2">
        <Input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mật khẩu mới"
          autoComplete="new-password"
          className="!mt-0"
        />
        <Button type="submit" disabled={!password || reset.isPending} className="shrink-0">
          Đặt lại
        </Button>
      </div>
      <ErrorText error={formError ? { message: formError } : reset.error} />
      {reset.isSuccess && (
        <p className="text-sm font-semibold text-bamboo-dark">Đã đặt lại mật khẩu.</p>
      )}
    </form>
  );
}
