import { ROLE_LABELS } from '@bot-op/shared';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { useLogout, useMe } from '../features/auth/queries';

const NAV = [
  { to: '/', label: 'Trang chủ', icon: '🏠' },
  { to: '/order', label: 'Order', icon: '🛒' },
  { to: '/expenses', label: 'Chi tiêu', icon: '💸' },
  { to: '/ops', label: 'Vận hành', icon: '📋' },
];

export function AppLayout() {
  const { data: me } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col bg-white shadow-sm">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-brand-700 px-4 py-3 text-white">
        <div className="min-w-0">
          <div className="truncate font-semibold">BamThai Vận hành</div>
          {me && (
            <div className="truncate text-sm text-white/80">
              {me.name} · {ROLE_LABELS[me.role]}
              {me.branch ? ` · ${me.branch.code}` : ''}
            </div>
          )}
        </div>
        <button
          className="shrink-0 rounded-lg px-3 py-2 text-sm text-white/90 active:bg-white/20"
          disabled={logout.isPending}
          onClick={() =>
            logout.mutate(undefined, { onSettled: () => navigate('/login', { replace: true }) })
          }
        >
          Đăng xuất
        </button>
      </header>

      <main className="flex-1 p-4 pb-24">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 mx-auto grid max-w-xl grid-cols-4 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)]">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 text-xs ${isActive ? 'font-semibold text-brand-700' : 'text-stone-500'}`
            }
          >
            <span className="text-xl leading-none">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
