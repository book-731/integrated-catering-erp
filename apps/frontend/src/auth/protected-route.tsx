import { Navigate, Outlet, useLocation, Link } from 'react-router-dom';
import { useAuth } from './auth-context';
import type { Role } from '../config/roles';
export function AuthLoading() {
  const auth = useAuth();
  if (auth.status === 'error')
    return (
      <section className="panel empty-state">
        <h1>登入服務暫時無法使用</h1>
        <p role="alert">{auth.error}</p>
        <button className="button button-dark" onClick={() => void auth.refresh()}>
          重新連線
        </button>
      </section>
    );
  return (
    <div className="panel empty-state" role="status">
      正在確認登入狀態…
    </div>
  );
}
export function ForbiddenPage() {
  return (
    <section className="panel empty-state">
      <span className="pill pill-amber">403</span>
      <h1>權限不足</h1>
      <p>目前角色沒有存取此頁面的權限。</p>
      <Link to="/" className="button button-dark">
        返回系統總覽
      </Link>
    </section>
  );
}
export function ProtectedRoute({ roles }: { roles?: readonly Role[] }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.status !== 'ready') return <AuthLoading />;
  if (!auth.user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(auth.user.role)) return <ForbiddenPage />;
  return <Outlet />;
}
