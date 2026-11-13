import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import * as api from '../api/auth';
import { onUnauthorized, setCsrfToken } from '../api/client';
import type { SessionData } from '../api/auth';
import { AuthContext, type AuthState } from './auth-context';
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null, error: null });
  const generation = useRef(0);
  const mutating = useRef(false);
  const apply = useCallback((data: SessionData) => {
    setCsrfToken(data.csrfToken);
    setState({ status: 'ready', user: data.user, error: null });
  }, []);
  const refresh = useCallback(
    async (background = false) => {
      const current = ++generation.current;
      if (!background) setState((value) => ({ ...value, status: 'loading', error: null }));
      try {
        const data = await api.getSession();
        if (current === generation.current) apply(data);
      } catch (error) {
        if (current === generation.current) {
          setCsrfToken(null);
          setState({
            status: 'error',
            user: null,
            error: error instanceof Error ? error.message : '登入狀態載入失敗。',
          });
        }
      }
    },
    [apply],
  );
  useEffect(() => {
    void refresh();
    return () => {
      generation.current++;
    };
  }, [refresh]);
  useEffect(
    () =>
      onUnauthorized(() => {
        setCsrfToken(null);
        void refresh();
      }),
    [refresh],
  );
  useEffect(() => {
    const focus = () => {
      if (!mutating.current) void refresh(true);
    };
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, [refresh]);
  const login = useCallback(
    async (email: string, password: string) => {
      mutating.current = true;
      const current = ++generation.current;
      try {
        const data = await api.login(email, password);
        if (current === generation.current) apply(data);
      } finally {
        mutating.current = false;
      }
    },
    [apply],
  );
  const logout = useCallback(async () => {
    mutating.current = true;
    generation.current++;
    try {
      await api.logout();
      setCsrfToken(null);
      setState({ status: 'loading', user: null, error: null });
      await refresh();
    } finally {
      mutating.current = false;
    }
  }, [refresh]);
  return (
    <AuthContext.Provider value={{ ...state, refresh, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
