import { createBrowserRouter } from 'react-router';
import { AppLayout } from './components/AppLayout';
import { RequireAuth } from './components/RequireAuth';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/order', element: <ComingSoonPage title="Order nguyên liệu" /> },
          { path: '/expenses', element: <ComingSoonPage title="Chi tiêu" /> },
          { path: '/ops', element: <ComingSoonPage title="Vận hành" /> },
          { path: '*', element: <ComingSoonPage title="Không tìm thấy trang" /> },
        ],
      },
    ],
  },
]);
