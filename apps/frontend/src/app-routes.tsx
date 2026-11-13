import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AuthProvider } from './auth/auth-provider';
import { useAuth } from './auth/auth-context';
import { ProtectedRoute, ForbiddenPage } from './auth/protected-route';
import { AdminLayout } from './components/admin-layout';
import { modules } from './config/modules';
import {
  InventoryPage,
  OrdersPage,
  PurchasingPage,
  StaffPage,
  ReportsPage,
} from './pages/operations';
import { MenuConfigurationPage } from './pages/menu-configuration';
const Dashboard = lazy(() =>
  import('./pages/dashboard').then((module) => ({ default: module.Dashboard })),
);
const Login = lazy(() => import('./pages/login').then((module) => ({ default: module.LoginPage })));
const Users = lazy(() => import('./pages/users').then((module) => ({ default: module.UsersPage })));
const Ingredients = lazy(() =>
  import('./pages/ingredients').then((module) => ({ default: module.IngredientsPage })),
);
const Categories = lazy(() =>
  import('./pages/menu-categories').then((module) => ({ default: module.CategoriesPage })),
);
const MenuItems = lazy(() =>
  import('./pages/menu-items').then((module) => ({ default: module.MenuItemsPage })),
);
const Placeholder = lazy(() =>
  import('./pages/module-placeholder').then((module) => ({ default: module.ModulePlaceholder })),
);
function ModuleRoute() {
  const { slug } = useParams();
  const { user } = useAuth();
  const module = modules.find((item) => item.slug === slug);
  if (module && user && !module.roles.includes(user.role)) return <ForbiddenPage />;
  if (module?.implemented) return <Navigate to={module.path} replace />;
  return <Placeholder />;
}
export function AppRoutes() {
  return (
    <AuthProvider>
      <Suspense
        fallback={
          <div className="panel empty-state" role="status">
            正在載入頁面…
          </div>
        }
      >
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AdminLayout />}>
              <Route index element={<Dashboard />} />
              <Route element={<ProtectedRoute roles={['ADMIN']} />}>
                <Route path="users" element={<Users />} />
              </Route>
              <Route element={<ProtectedRoute roles={['ADMIN', 'MANAGER', 'KITCHEN']} />}>
                <Route path="ingredients" element={<Ingredients />} />
              </Route>
              <Route path="orders" element={<OrdersPage />} />
              <Route path="menu-configuration" element={<MenuConfigurationPage />} />
              <Route element={<ProtectedRoute roles={['ADMIN', 'MANAGER', 'KITCHEN']} />}>
                <Route path="inventory" element={<InventoryPage />} />
              </Route>
              <Route element={<ProtectedRoute roles={['ADMIN', 'MANAGER']} />}>
                <Route path="purchasing" element={<PurchasingPage />} />
                <Route path="staff" element={<StaffPage />} />
                <Route path="reports" element={<ReportsPage />} />
              </Route>
              <Route path="menu-categories" element={<Categories />} />
              <Route path="menu-items" element={<MenuItems />} />
              <Route path="modules/:slug" element={<ModuleRoute />} />
              <Route path="*" element={<Placeholder />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}
