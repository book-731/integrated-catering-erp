import { ApiError } from '../../src/common/api-error.js';
import type { AuthRepository } from '../../src/modules/auth/auth.repository.interface.js';
import type { SessionRecord, StoredUser, UserQuery } from '../../src/modules/auth/auth.types.js';

// 僅供單元測試；正式執行一律使用 Prisma repository。
export class MemoryAuthRepository implements AuthRepository {
  users = new Map<string, StoredUser>();
  sessions = new Map<string, SessionRecord>();
  limits = new Map<string, { count: number; resetAt: Date }>();
  async findUserByEmail(email: string) {
    return (
      [...this.users.values()].find((user) => user.email.toLowerCase() === email.toLowerCase()) ??
      null
    );
  }
  async findSession(id: string) {
    const session = this.sessions.get(id);
    return session
      ? { session, user: session.userId ? (this.users.get(session.userId) ?? null) : null }
      : null;
  }
  async createAnonymousSession(session: SessionRecord) {
    this.sessions.set(session.id, session);
  }
  async rotateSession(oldId: string, expected: StoredUser, session: SessionRecord) {
    const user = this.users.get(expected.id);
    if (!user?.isActive || user.authVersion !== expected.authVersion || !this.sessions.has(oldId))
      throw new ApiError(401, 'INVALID_CREDENTIALS', '帳號或密碼不正確，或帳號無法使用。');
    this.sessions.delete(oldId);
    this.sessions.set(session.id, session);
    return user;
  }
  async touchSession(id: string, now: Date) {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.lastSeenAt = now;
    return true;
  }
  async deleteSession(id: string) {
    this.sessions.delete(id);
  }
  async consumeLimit(key: string, now: Date, windowMs: number) {
    const current = this.limits.get(key);
    const value =
      current && current.resetAt > now
        ? { ...current, count: current.count + 1 }
        : { count: 1, resetAt: new Date(now.getTime() + windowMs) };
    this.limits.set(key, value);
    return value;
  }
  async listUsers(query: UserQuery) {
    const items = [...this.users.values()].filter(
      (user) =>
        (!query.role || user.role === query.role) &&
        (query.isActive === undefined || query.isActive === user.isActive) &&
        (!query.q || `${user.email} ${user.displayName}`.includes(query.q)),
    );
    return {
      items: items.slice((query.page - 1) * query.pageSize, query.page * query.pageSize),
      total: items.length,
    };
  }
  createUser: AuthRepository['createUser'] = async () => {
    throw new Error('User writes require database integration tests.');
  };
  updateUser: AuthRepository['updateUser'] = async () => {
    throw new Error('User writes require database integration tests.');
  };
  bootstrapAdmin: AuthRepository['bootstrapAdmin'] = async () => {
    throw new Error('Bootstrap requires database integration tests.');
  };
}
