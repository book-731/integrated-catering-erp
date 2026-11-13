import { createContext, useContext } from 'react';
import type { User } from '../api/auth';
export interface AuthState {
  status: 'loading' | 'ready' | 'error';
  user: User | null;
  error: string | null;
}
interface AuthContextValue extends AuthState {
  refresh: (background?: boolean) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}
export const AuthContext = createContext<AuthContextValue | null>(null);
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('AuthProvider is required.');
  return context;
}
