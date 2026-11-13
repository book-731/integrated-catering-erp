import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { AuthService, hashToken } from '../src/modules/auth/auth.service.js';
import { hashPassword, verifyPassword } from '../src/modules/auth/password.js';
import type { Role, StoredUser } from '../src/modules/auth/auth.types.js';
import { MemoryAuthRepository } from './fixtures/memory-auth.js';

const password = randomBytes(24).toString('base64url');
let digest: string;
let repository: MemoryAuthRepository;
beforeAll(async () => {
  digest = await hashPassword(password);
});
beforeEach(() => {
  repository = new MemoryAuthRepository();
});
function user(role: Role = 'ADMIN', active = true) {
  const item: StoredUser = {
    id: randomUUID(),
    email: `${randomUUID()}@example.test`,
    displayName: '測試成員',
    role,
    isActive: active,
    passwordHash: digest,
    authVersion: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  repository.users.set(item.id, item);
  return item;
}
function app() {
  return createApp({ authRepository: repository });
}

describe('認證、Cookie、CSRF 與 RBAC HTTP 單元測試', () => {
  it('使用 Argon2id 與安全參數，正確／錯誤密碼可區分', async () => {
    expect(digest).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword(digest, password)).toBe(true);
    expect(await verifyPassword(digest, randomBytes(24).toString('base64url'))).toBe(false);
  });
  it('登入時更換 Session，Cookie 為 HttpOnly，DB 僅保存 token hash，登出後不可重用', async () => {
    const admin = user();
    const agent = request.agent(app());
    const initial = await agent.get('/api/auth/session').expect(200);
    const previous = String(initial.headers['set-cookie']?.[0]).split(';')[0]!;
    expect(initial.headers['set-cookie']?.[0]).toContain('HttpOnly');
    expect(initial.headers['set-cookie']?.[0]).toContain('SameSite=Lax');
    const logged = await agent
      .post('/api/auth/login')
      .set('Origin', env.APP_ORIGIN)
      .set('X-CSRF-Token', initial.body.data.csrfToken)
      .send({ email: admin.email, password })
      .expect(200);
    const cookie = String(logged.headers['set-cookie']?.[0]).split(';')[0]!;
    expect(cookie).not.toBe(previous);
    expect(logged.body.data.user.passwordHash).toBeUndefined();
    expect(logged.body.data.user.authVersion).toBeUndefined();
    const token = cookie.slice(cookie.indexOf('=') + 1);
    expect(repository.sessions.has(token)).toBe(false);
    expect(repository.sessions.has(hashToken(token))).toBe(true);
    await request(app()).get('/api/auth/me').set('Cookie', previous).expect(401);
    await agent
      .post('/api/auth/logout')
      .set('Origin', env.APP_ORIGIN)
      .set('X-CSRF-Token', logged.body.data.csrfToken)
      .send({})
      .expect(200);
    await request(app()).get('/api/auth/me').set('Cookie', cookie).expect(401);
  });
  it.each(['incorrect', 'unknown', 'disabled'] as const)(
    '%s 登入回傳相同的 401，不暴露帳號狀態',
    async (kind) => {
      const member = user('CASHIER', kind !== 'disabled');
      const agent = request.agent(app());
      const initial = await agent.get('/api/auth/session').expect(200);
      const response = await agent
        .post('/api/auth/login')
        .set('Origin', env.APP_ORIGIN)
        .set('X-CSRF-Token', initial.body.data.csrfToken)
        .send({
          email: kind === 'unknown' ? `${randomUUID()}@example.test` : member.email,
          password: kind === 'incorrect' ? randomBytes(24).toString('base64url') : password,
        })
        .expect(401);
      expect(response.body.error).toEqual({
        code: 'INVALID_CREDENTIALS',
        message: '帳號或密碼不正確，或帳號無法使用。',
      });
      expect(JSON.stringify(response.body)).not.toContain(digest);
    },
  );
  it('未登入即拒絕使用者管理 API', async () => {
    await request(app()).get('/api/users').expect(401);
  });
  it.each(['MANAGER', 'CASHIER', 'KITCHEN'] as const)(
    '%s 可登入但不可呼叫 ADMIN API',
    async (role) => {
      const member = user(role);
      const agent = request.agent(app());
      const initial = await agent.get('/api/auth/session');
      await agent
        .post('/api/auth/login')
        .set('Origin', env.APP_ORIGIN)
        .set('X-CSRF-Token', initial.body.data.csrfToken)
        .send({ email: member.email, password })
        .expect(200);
      const denied = await agent.get('/api/users').expect(403);
      expect(denied.body.error.code).toBe('FORBIDDEN');
    },
  );
  it('登入也需要 CSRF token 與正確 Origin', async () => {
    const member = user();
    const agent = request.agent(app());
    const initial = await agent.get('/api/auth/session');
    await agent
      .post('/api/auth/login')
      .set('Origin', env.APP_ORIGIN)
      .send({ email: member.email, password })
      .expect(403);
    await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', initial.body.data.csrfToken)
      .send({ email: member.email, password })
      .expect(403);
    await agent
      .post('/api/auth/login')
      .set('Origin', 'https://untrusted.example')
      .set('X-CSRF-Token', initial.body.data.csrfToken)
      .send({ email: member.email, password })
      .expect(403);
  });
  it('速率限制到期前阻擋，到期後恢復', async () => {
    let now = new Date();
    const service = new AuthService(repository, () => now);
    expect(await service.limit('test', 'identity', 1, 1000)).toBe(0);
    expect(await service.limit('test', 'identity', 1, 1000)).toBe(1);
    now = new Date(now.getTime() + 1001);
    expect(await service.limit('test', 'identity', 1, 1000)).toBe(0);
  });
  it('Session 閒置／絕對期限與帳號版本撤銷均生效', async () => {
    const member = user();
    const service = new AuthService(repository);
    const issued = service.issue(member.id, member.authVersion);
    repository.sessions.set(issued.session.id, issued.session);
    member.authVersion++;
    expect(await service.read(issued.token)).toBeNull();
    const expired = service.issue(null, null);
    expired.session.expiresAt = new Date(0);
    repository.sessions.set(expired.session.id, expired.session);
    expect(await service.read(expired.token)).toBeNull();
    const idle = service.issue(member.id, member.authVersion);
    idle.session.lastSeenAt = new Date(Date.now() - env.SESSION_IDLE_MINUTES * 60000 - 1);
    repository.sessions.set(idle.session.id, idle.session);
    expect(await service.read(idle.token)).toBeNull();
  });
});
