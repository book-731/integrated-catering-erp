import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  ArrowUpRight,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { modules } from '../config/modules';
import { apiDocsUrl } from '../config/api';
import { useAuth } from '../auth/auth-context';
import { roleLabels } from '../config/roles';

export function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const auth = useAuth();
  const location = useLocation();
  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [mobileOpen]);
  const title =
    modules.find(
      (module) =>
        location.pathname === module.path || location.pathname === `/modules/${module.slug}`,
    )?.name ?? (location.pathname.startsWith('/menu-') ? '菜單與商品' : '系統總覽');
  return (
    <div className="app-shell">
      {mobileOpen && (
        <button
          className="sidebar-overlay"
          aria-label="關閉導覽選單"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        id="main-sidebar"
        className={`sidebar ${mobileOpen ? 'is-open' : ''}`}
        aria-label="主導覽"
      >
        <NavLink to="/" className="brand">
          <span className="brand-mark">
            <UtensilsCrossed size={22} />
          </span>
          <span>
            餐序<span className="brand-en">RESTAURANT ERP</span>
          </span>
        </NavLink>
        <button
          className="mobile-close"
          aria-label="關閉側邊欄"
          onClick={() => setMobileOpen(false)}
        >
          <X size={20} />
        </button>
        <div className="workspace">
          <span className="workspace-avatar">12</span>
          <span>
            <strong>第 12 組工作空間</strong>
            <small>國立高雄科技大學 · 資管系</small>
          </span>
        </div>
        <p className="nav-label">工作台</p>
        <nav>
          <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <LayoutDashboard size={19} />
            <span>系統總覽</span>
            <span className="active-dot" />
          </NavLink>
          <p className="nav-label modules-label">
            管理模組 <span>07</span>
          </p>
          {modules
            .filter((module) => auth.user && module.roles.includes(auth.user.role))
            .map((module) => (
              <NavLink
                key={module.slug}
                to={module.path}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <module.icon size={19} />
                <span>{module.name}</span>
                {!module.implemented && <small className="soon-tag">待開發</small>}
                {module.note && <small className="soon-tag">{module.note}</small>}
              </NavLink>
            ))}
        </nav>
        <div className="sidebar-footer">
          <div className="phase-indicator">
            <span />
            七大模組 · 本機整合版
          </div>
          <p>讓每一個營運環節，井然有序。</p>
          <div className="sidebar-footer-bottom">
            <span>v0.4.0</span>
            <PanelLeftClose size={16} aria-hidden="true" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="mobile-menu icon-button"
              aria-label="開啟導覽選單"
              aria-expanded={mobileOpen}
              aria-controls="main-sidebar"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span>管理工作台</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{title}</strong>
          </div>
          <div className="header-right">
            <span className="environment-tag">
              <span />
              開發環境
            </span>
            <span className="header-divider" />
            <a href={apiDocsUrl} target="_blank" rel="noreferrer" className="docs-link">
              API 文件 <ArrowUpRight size={15} />
            </a>
            <span className="current-user">
              <strong>{auth.user?.displayName}</strong>
              <small>{auth.user ? roleLabels[auth.user.role] : ''}</small>
            </span>
            <button
              className="button button-white"
              disabled={loggingOut}
              onClick={() => {
                setLoggingOut(true);
                setLogoutError(null);
                void auth
                  .logout()
                  .catch((error) =>
                    setLogoutError(error instanceof Error ? error.message : '登出失敗。'),
                  )
                  .finally(() => setLoggingOut(false));
              }}
            >
              {loggingOut ? '登出中…' : '登出'}
            </button>
          </div>
        </header>
        <main id="main-content" className="main-content">
          {logoutError && (
            <p role="alert" className="form-error">
              {logoutError}
            </p>
          )}
          <Outlet />
        </main>
        <footer className="page-footer">
          <span>餐序 ERP · 第 12 組軟體工程專案</span>
          <span>Windows 本機 ERP</span>
        </footer>
      </div>
    </div>
  );
}
