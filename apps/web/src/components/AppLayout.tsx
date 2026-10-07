import { ROLE_LABELS } from '@bot-op/shared';
import { Link, NavLink, Outlet, useMatches, useNavigate } from 'react-router';
import { useLogout, useMe } from '../features/auth/queries';
import { Logo } from './Logo';

const NAV = [
  { to: '/', label: 'Trang chủ', icon: '🏠' },
  { to: '/order', label: 'Order', icon: '🛒' },
  { to: '/po', label: 'Đơn hàng', icon: '📦' },
  { to: '/expenses', label: 'Chi tiêu', icon: '💸' },
  { to: '/ops', label: 'Vận hành', icon: '📋' },
];

/**
 * Route handle flag: the page fills exactly the screen above the tab bar and does its own scrolling
 * (e.g. Order keeps search and filters in place while only the list scrolls).
 */
export type RouteHandle = { fixedLayout?: boolean };

export function AppLayout() {
  const { data: me } = useMe();
  const fixedLayout = useMatches().some((m) => (m.handle as RouteHandle | undefined)?.fixedLayout);
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <div
      className={`mx-auto flex max-w-xl flex-col bg-white shadow-sm ${
        fixedLayout
          ? 'h-[calc(100dvh-var(--nav-h)-env(safe-area-inset-bottom))] overflow-hidden'
          : 'min-h-dvh'
      }`}
    >
      {/* Not sticky: on a phone the screen height is better spent on content; the tab bar handles navigation. */}
      <header className="flex items-center justify-between border-b border-line bg-cream pr-3">
        {/* Logo carries its own clear space, so no extra padding on the left. */}
        <Link to="/" aria-label="Trang chủ" className="block shrink-0">
          <Logo width={140} />
        </Link>
        <div className="min-w-0 text-right">
          {me && (
            <div className="truncate text-sm leading-tight">
              <span className="font-semibold">{me.name}</span>
              <span className="text-ink-muted">
                {' '}
                · {ROLE_LABELS[me.role]}
                {me.branch ? ` · ${me.branch.code}` : ''}
              </span>
            </div>
          )}
          <button
            className="-mr-2 rounded-lg px-2 py-1 text-xs text-ink-muted underline decoration-line-strong underline-offset-2 active:bg-elephant-soft"
            disabled={logout.isPending}
            onClick={() =>
              logout.mutate(undefined, { onSettled: () => navigate('/login', { replace: true }) })
            }
          >
            Đăng xuất
          </button>
        </div>
      </header>

      <main
        className={
          fixedLayout
            ? 'flex min-h-0 flex-1 flex-col px-3 pt-2'
            : 'flex-1 px-3 pt-3 pb-[calc(var(--nav-h)+1rem+env(safe-area-inset-bottom))]'
        }
      >
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 mx-auto grid max-w-xl grid-cols-5 border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex h-[var(--nav-h)] flex-col items-center justify-center gap-0.5 border-t-[3px] text-[11px] leading-none ${
                isActive
                  ? 'border-elephant font-semibold text-ink'
                  : 'border-transparent text-ink-muted'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`rounded-full px-3 py-0.5 text-lg leading-none ${isActive ? 'bg-elephant-soft' : ''}`}
                >
                  {item.icon}
                </span>
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
