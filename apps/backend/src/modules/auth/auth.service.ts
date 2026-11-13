import { createHash, randomBytes } from 'node:crypto';
import { ApiError } from '../../common/api-error.js';
import { env } from '../../config/env.js';
import type { AuthRepository } from './auth.repository.interface.js';
import { dummyPasswordHash, verifyPassword } from './password.js';
import { publicUser, type SessionContext, type SessionRecord } from './auth.types.js';

export const hashToken = (value: string) => createHash('sha256').update(value).digest('hex');
export class AuthService {
  constructor(
    readonly repository: AuthRepository,
    readonly now: () => Date = () => new Date(),
  ) {}
  async limit(scope: string, value: string, max: number, windowMs: number): Promise<number> {
    const now = this.now();
    const result = await this.repository.consumeLimit(
      hashToken(`${scope}:${value}`),
      now,
      windowMs,
    );
    return result.count > max
      ? Math.max(1, Math.ceil((result.resetAt.getTime() - now.getTime()) / 1000))
      : 0;
  }
  async read(token?: string): Promise<SessionContext | null> {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const record = await this.repository.findSession(hashToken(token));
    if (!record) return null;
    const now = this.now();
    const { session, user } = record;
    if (
      session.expiresAt <= now ||
      now.getTime() - session.lastSeenAt.getTime() >= env.SESSION_IDLE_MINUTES * 60000 ||
      (session.userId !== null && (!user?.isActive || user.authVersion !== session.authVersion))
    ) {
      await this.repository.deleteSession(session.id);
      return null;
    }
    if (!(await this.repository.touchSession(session.id, now))) return null;
    return { session: { ...session, lastSeenAt: now }, user };
  }
  issue(userId: string | null, authVersion: number | null) {
    const token = randomBytes(32).toString('base64url');
    const now = this.now();
    const session: SessionRecord = {
      id: hashToken(token),
      csrfToken: randomBytes(32).toString('base64url'),
      userId,
      authVersion,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + (userId ? env.SESSION_MAX_HOURS * 3600000 : 20 * 60000)),
    };
    return { token, session };
  }
  data(context: SessionContext) {
    return {
      user: context.user ? publicUser(context.user) : null,
      csrfToken: context.session.csrfToken,
      expiresAt: context.session.expiresAt.toISOString(),
    };
  }
  async bootstrap(token: string | undefined, ip: string) {
    const existing = await this.read(token);
    if (existing) return { token: null, context: existing };
    const retry = await this.limit('bootstrap-ip', ip, 60, 60000);
    if (retry) return { retryAfter: retry };
    const issued = this.issue(null, null);
    await this.repository.createAnonymousSession(issued.session);
    return { token: issued.token, context: { session: issued.session, user: null } };
  }
  async login(context: SessionContext, input: { email: string; password: string }, ip: string) {
    const retryIp = await this.limit('login-ip', ip, env.LOGIN_RATE_LIMIT_IP, 15 * 60000);
    const retryAccount = retryIp
      ? 0
      : await this.limit('login-account', input.email, env.LOGIN_RATE_LIMIT_ACCOUNT, 15 * 60000);
    if (retryIp || retryAccount) return { retryAfter: Math.max(retryIp, retryAccount) };
    const user = await this.repository.findUserByEmail(input.email);
    const matches = await verifyPassword(
      user?.passwordHash ?? (await dummyPasswordHash()),
      input.password,
    );
    if (!user?.isActive || !matches)
      throw new ApiError(401, 'INVALID_CREDENTIALS', '帳號或密碼不正確，或帳號無法使用。');
    const issued = this.issue(user.id, user.authVersion);
    const current = await this.repository.rotateSession(context.session.id, user, issued.session);
    return { token: issued.token, context: { session: issued.session, user: current } };
  }
}
