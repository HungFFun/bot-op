import { loginBodySchema } from '@bot-op/shared';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useLogin, useMe } from '../features/auth/queries';

export function LoginPage() {
  const me = useMe();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const from = (location.state as { from?: string } | null)?.from ?? '/';
  if (me.data) return <Navigate to={from} replace />;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = loginBodySchema.safeParse({ phone, pin });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ');
      return;
    }
    setFormError(null);
    login.mutate(parsed.data, {
      onSuccess: () => navigate(from, { replace: true }),
      onError: () => setPin(''),
    });
  };

  const error = formError ?? login.error?.message;

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-brand-700 px-5 py-10">
      <form
        onSubmit={onSubmit}
        className="mx-auto w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg"
      >
        <h1 className="text-2xl font-bold text-brand-800">BamThai Vận hành</h1>
        <p className="mt-1 text-stone-500">Đăng nhập bằng số điện thoại và PIN</p>

        <label className="mt-6 block">
          <span className="text-sm font-medium text-stone-700">Số điện thoại</span>
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="username"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="09xx xxx xxx"
            className="mt-1 w-full rounded-xl border border-stone-300 px-4 py-3 text-lg outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
          />
        </label>

        <label className="mt-4 block">
          <span className="text-sm font-medium text-stone-700">PIN (6 số)</span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="••••••"
            className="mt-1 w-full rounded-xl border border-stone-300 px-4 py-3 text-center text-2xl tracking-[0.5em] outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
          />
        </label>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={login.isPending}
          className="mt-6 w-full rounded-xl bg-brand-700 py-4 text-lg font-semibold text-white active:bg-brand-800 disabled:opacity-60"
        >
          {login.isPending ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>
    </div>
  );
}
