import { lazy, Suspense } from 'react';
import { BrowserRouter } from 'react-router-dom';
const AppRoutes = lazy(() =>
  import('./app-routes').then((module) => ({ default: module.AppRoutes })),
);
const loading = (
  <div className="panel empty-state" role="status">
    正在載入頁面…
  </div>
);
export function App() {
  return (
    <>
      <a href="#main-content" className="skip-link">
        跳至主要內容
      </a>
      <BrowserRouter>
        <Suspense fallback={loading}>
          <AppRoutes />
        </Suspense>
      </BrowserRouter>
    </>
  );
}
