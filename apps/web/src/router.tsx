import { CATALOG_EDITOR_ROLES } from '@bot-op/shared';
import { createBrowserRouter } from 'react-router';
import { AppLayout, type RouteHandle } from './components/AppLayout';
import { RequireAuth } from './components/RequireAuth';
import { RequireRole } from './components/RequireRole';
import { AdminHomePage } from './pages/admin/AdminHomePage';
import { CategoriesPage } from './pages/admin/CategoriesPage';
import { ImportPage } from './pages/admin/ImportPage';
import { IngredientEditPage } from './pages/admin/IngredientEditPage';
import { IngredientsPage } from './pages/admin/IngredientsPage';
import { SuppliersPage } from './pages/admin/SuppliersPage';
import { UsersPage } from './pages/admin/UsersPage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { CartPage } from './pages/order/CartPage';
import { OrderPage } from './pages/order/OrderPage';
import { OrderSentPage } from './pages/order/OrderSentPage';
import { PoDetailPage } from './pages/po/PoDetailPage';
import { PoListPage } from './pages/po/PoListPage';
import { PoReceivePage } from './pages/po/PoReceivePage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <HomePage /> },
          {
            path: '/order',
            element: <OrderPage />,
            handle: { fixedLayout: true } satisfies RouteHandle,
          },
          { path: '/cart', element: <CartPage /> },
          { path: '/order/sent', element: <OrderSentPage /> },
          { path: '/po', element: <PoListPage /> },
          { path: '/po/:id', element: <PoDetailPage /> },
          { path: '/po/:id/receive', element: <PoReceivePage /> },
          { path: '/expenses', element: <ComingSoonPage title="Chi tiêu" /> },
          { path: '/ops', element: <ComingSoonPage title="Vận hành" /> },
          {
            element: <RequireRole roles={CATALOG_EDITOR_ROLES} />,
            children: [
              { path: '/admin', element: <AdminHomePage /> },
              { path: '/admin/ingredients', element: <IngredientsPage /> },
              { path: '/admin/ingredients/new', element: <IngredientEditPage /> },
              { path: '/admin/ingredients/:id', element: <IngredientEditPage /> },
              { path: '/admin/suppliers', element: <SuppliersPage /> },
              { path: '/admin/categories', element: <CategoriesPage /> },
            ],
          },
          {
            element: <RequireRole roles={['owner']} />,
            children: [
              { path: '/admin/import', element: <ImportPage /> },
              { path: '/admin/users', element: <UsersPage /> },
            ],
          },
          { path: '*', element: <ComingSoonPage title="Không tìm thấy trang" /> },
        ],
      },
    ],
  },
]);
