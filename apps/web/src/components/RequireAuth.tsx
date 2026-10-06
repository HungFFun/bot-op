import { Navigate, Outlet, useLocation } from 'react-router';
import { useMe } from '../features/auth/queries';
import { FullScreenMessage } from './FullScreenMessage';

export function RequireAuth() {
  const me = useMe();
  const location = useLocation();

  if (me.isPending) return <FullScreenMessage>Đang tải…</FullScreenMessage>;
  if (me.isError) {
    return (
      <FullScreenMessage>
        <div>
          <p>{me.error.message}</p>
          <button
            className="mt-4 rounded-xl bg-brand-700 px-6 py-3 text-white"
            onClick={() => me.refetch()}
          >
            Thử lại
          </button>
        </div>
      </FullScreenMessage>
    );
  }
  if (!me.data) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
