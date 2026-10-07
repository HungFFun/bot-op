import { loginBodySchema } from '@bot-op/shared';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Logo } from '../components/Logo';
import { useLogin, useMe } from '../features/auth/queries';

const inputClass =
  'mt-1 w-full rounded-xl border border-line-strong px-4 py-2.5 text-lg outline-none focus:border-ink focus:ring-2 focus:ring-elephant/40';

export function LoginPage() {
  const me = useMe();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const from = (location.state as { from?: string } | null)?.from ?? '/';
  if (me.data) return <Navigate to={from} replace />;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = loginBodySchema.safeParse({ username, password });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ');
      return;
    }
    setFormError(null);
    login.mutate(parsed.data, {
      onSuccess: () => navigate(from, { replace: true }),
      onError: () => setPassword(''),
    });
  };

  const error = formError ?? login.error?.message;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-cream px-5 py-8">
      <Logo variant="stacked" width={168} />
      <form
        onSubmit={onSubmit}
        className="mt-2 w-full max-w-sm rounded-2xl border border-line bg-white p-5 shadow-sm"
      >
        <h1 className="text-xl font-bold">Hệ thống vận hành</h1>
        <p className="mt-1 text-ink-muted">Đăng nhập bằng tài khoản được admin cấp</p>

        <label className="mt-4 block">
          <span className="text-sm font-medium text-ink">Tên đăng nhập</span>
          <input
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="mt-3 block">
          <span className="text-sm font-medium text-ink">Mật khẩu</span>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputClass} pr-16`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute top-1/2 right-2 mt-0.5 -translate-y-1/2 rounded-lg px-2 py-1 text-sm text-ink-muted active:bg-cream"
            >
              {showPassword ? 'Ẩn' : 'Hiện'}
            </button>
          </div>
        </label>

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-lg border-l-4 border-chili bg-chili-soft px-3 py-2 text-sm text-ink"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={login.isPending}
          className="mt-4 w-full rounded-xl bg-elephant py-3 text-lg font-semibold text-ink active:bg-elephant-press disabled:opacity-60"
        >
          {login.isPending ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
        <p className="mt-3 text-center text-sm text-ink-muted">
          Quên mật khẩu? Liên hệ admin để đặt lại.
        </p>
      </form>
    </div>
  );
}
