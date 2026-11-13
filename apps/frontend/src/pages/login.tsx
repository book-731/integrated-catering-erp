import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ArrowRight, ShieldCheck, UtensilsCrossed } from 'lucide-react';
import { z } from 'zod';
import { useAuth } from '../auth/auth-context';
import { AuthLoading } from '../auth/protected-route';
import { ApiClientError } from '../api/client';
export function LoginPage() {
  const auth = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const from =
    typeof location.state?.from === 'string' &&
    location.state.from.startsWith('/') &&
    !location.state.from.startsWith('//') &&
    location.state.from !== '/login'
      ? location.state.from
      : '/';
  if (auth.status !== 'ready') return <AuthLoading />;
  if (auth.user) return <Navigate to={from} replace />;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!z.email().safeParse(email.trim()).success || !password) {
      setError('請輸入有效的 Email 與密碼。');
      return;
    }
    setBusy(true);
    try {
      await auth.login(email.trim().toLowerCase(), password);
      setPassword('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '登入失敗，請稍後再試。');
      if (failure instanceof ApiClientError && failure.code === 'CSRF_INVALID')
        await auth.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="login-story">
        <div className="login-brand">
          <UtensilsCrossed size={27} />
          <span>
            餐序<span>RESTAURANT ERP</span>
          </span>
        </div>
        <div>
          <p className="eyebrow">ONE WORKSPACE. EVERY ROLE.</p>
          <h1>
            讓每一個營運環節，
            <br />
            井然有序。
          </h1>
          <p>從安全的工作空間開始，連結團隊與日常營運。</p>
        </div>
        <p>國立高雄科技大學 · 資管系第 12 組</p>
      </section>
      <section className="login-form-panel">
        <form className="login-card" onSubmit={(event) => void submit(event)}>
          <span className="login-icon">
            <ShieldCheck size={26} />
          </span>
          <p className="eyebrow">WELCOME BACK</p>
          <h1>登入管理系統</h1>
          <p className="muted">請使用團隊配發的帳號登入。</p>
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            maxLength={254}
            disabled={busy}
          />
          <label htmlFor="login-password">密碼</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            maxLength={128}
            disabled={busy}
          />
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button button-dark login-submit" disabled={busy} type="submit">
            {busy ? '登入中…' : '登入系統'}
            <ArrowRight size={16} />
          </button>
          <p className="login-note">帳號由管理員建立；未開放公開註冊。</p>
        </form>
        <p className="login-footer">餐序 ERP · 本機整合版</p>
      </section>
    </main>
  );
}
