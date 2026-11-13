export const roles = ['ADMIN', 'MANAGER', 'CASHIER', 'KITCHEN'] as const;
export type Role = (typeof roles)[number];
export interface StoredUser {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: Role;
  isActive: boolean;
  authVersion: number;
  createdAt: Date;
  updatedAt: Date;
}
export type PublicUser = Omit<StoredUser, 'passwordHash' | 'authVersion'>;
export interface SessionRecord {
  id: string;
  csrfToken: string;
  userId: string | null;
  authVersion: number | null;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
}
export interface SessionContext {
  session: SessionRecord;
  user: StoredUser | null;
}
export interface Actor {
  id: string;
  authVersion: number;
}
export interface UserCreate {
  email: string;
  displayName: string;
  passwordHash: string;
  role: Role;
  isActive: boolean;
}
export interface UserUpdate {
  email?: string;
  displayName?: string;
  passwordHash?: string;
  role?: Role;
  isActive?: boolean;
}
export interface UserQuery {
  q: string;
  role?: Role;
  isActive?: boolean;
  page: number;
  pageSize: number;
}
export function publicUser(user: StoredUser): PublicUser {
  const { id, email, displayName, role, isActive, createdAt, updatedAt } = user;
  return { id, email, displayName, role, isActive, createdAt, updatedAt };
}
