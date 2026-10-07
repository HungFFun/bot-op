import type { UserRole } from '@bot-op/shared';
import { Outlet } from 'react-router';
import { useMe } from '../features/auth/queries';
import { Empty } from './ui';

/** Must be nested under RequireAuth. */
export function RequireRole({ roles }: { roles: readonly UserRole[] }) {
  const { data: me } = useMe();
  if (!me || !roles.includes(me.role)) return <Empty>Bạn không có quyền xem trang này.</Empty>;
  return <Outlet />;
}
