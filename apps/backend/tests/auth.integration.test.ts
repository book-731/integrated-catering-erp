import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { env } from '../src/config/env.js';
import { authRepository } from '../src/modules/auth/auth.repository.js';
import { AuthService, hashToken } from '../src/modules/auth/auth.service.js';
import { hashPassword } from '../src/modules/auth/password.js';
import type { AuthRepository } from '../src/modules/auth/auth.repository.interface.js';
import type { Role, StoredUser } from '../src/modules/auth/auth.types.js';

if (process.env.RUN_DB_INTEGRATION !== '1') throw new Error('請使用隔離整合測試指令。');
const runId = randomUUID();
const domain = `phase2-${runId}.test`;
const password = randomBytes(24).toString('base64url');
const sessionIds = new Set<string>();
const limitKeys = new Set<string>();
const userIds = new Set<string>();
let rateNamespace = randomUUID();
let digest: string;
let admin: StoredUser;
const members = new Map<Role, StoredUser>();
const repository: AuthRepository = {
  ...authRepository,
  async consumeLimit(key, now, windowMs) {
    const scoped = hashToken(`${rateNamespace}:${key}`);
    limitKeys.add(scoped);
    return authRepository.consumeLimit(scoped, now, windowMs);
  },
  async createAnonymousSession(session) {
    sessionIds.add(session.id);
    await authRepository.createAnonymousSession(session);
  },
  async rotateSession(oldId, user, session) {
    sessionIds.add(session.id);
    return authRepository.rotateSession(oldId, user, session);
  },
  async createUser(actor, input) {
    const created = await authRepository.createUser(actor, input);
    userIds.add(created.id);
    return created;
  },
};
const app = createApp({ authRepository: repository });
beforeAll(async () => {
  digest = await hashPassword(password);
  for (const role of ['ADMIN', 'MANAGER', 'CASHIER', 'KITCHEN'] as const) {
    const member = await prisma.user.create({
      data: {
        email: `${role.toLowerCase()}@${domain}`,
        displayName: `測試${role}`,
        role,
        passwordHash: digest,
      },
    });
    userIds.add(member.id);
    members.set(role, member);
  }
  admin = members.get('ADMIN')!;
});
beforeEach(() => {
  rateNamespace = randomUUID();
});
afterAll(async () => {
  await prisma.session.deleteMany({ where: { id: { in: [...sessionIds] } } });
  await prisma.user.deleteMany({
    where: { id: { in: [...userIds] }, email: { endsWith: `@${domain}` } },
  });
  await prisma.authRateLimit.deleteMany({ where: { key: { in: [...limitKeys] } } });
  await prisma.$disconnect();
});
async function login(member: StoredUser = admin, secret = password) {
  const agent = request.agent(app);
  const initial = await agent.get('/api/auth/session').expect(200);
  const response = await agent
    .post('/api/auth/login')
    .set('Origin', env.APP_ORIGIN)
    .set('X-CSRF-Token', initial.body.data.csrfToken)
    .send({ email: member.email, password: secret })
    .expect(200);
  return {
    agent,
    csrf: String(response.body.data.csrfToken),
    cookie: String(response.headers['set-cookie']?.[0]).split(';')[0]!,
    response,
  };
}
async function createMember(role: Role = 'CASHIER') {
  const member = await prisma.user.create({
    data: {
      email: `${randomUUID()}@${domain}`,
      displayName: '整合測試帳號',
      role,
      passwordHash: digest,
    },
  });
  userIds.add(member.id);
  return member;
}
describe('認證與使用者管理：真實 PostgreSQL 交易整合', () => {
  it('ADMIN 登入、HttpOnly Cookie、明確 CORS credentials 與安全回應欄位', async () => {
    const { agent, response, cookie } = await login();
    expect(response.headers['set-cookie']?.[0]).toContain('HttpOnly');
    expect(response.headers['set-cookie']?.[0]).toContain('SameSite=Lax');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.body.data.user).not.toHaveProperty('passwordHash');
    expect(response.body.data.user).not.toHaveProperty('authVersion');
    const raw = cookie.slice(cookie.indexOf('=') + 1);
    expect(await prisma.session.findUnique({ where: { id: raw } })).toBeNull();
    expect(await prisma.session.findUnique({ where: { id: hashToken(raw) } })).not.toBeNull();
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.data.user.id).toBe(admin.id);
  });
  it('錯誤密碼與未知帳號回傳相同 401', async () => {
    const agent = request.agent(app);
    const initial = await agent.get('/api/auth/session');
    for (const email of [admin.email, `${randomUUID()}@${domain}`]) {
      const result = await agent
        .post('/api/auth/login')
        .set('Origin', env.APP_ORIGIN)
        .set('X-CSRF-Token', initial.body.data.csrfToken)
        .send({ email, password: randomBytes(24).toString('base64url') })
        .expect(401);
      expect(result.body.error.code).toBe('INVALID_CREDENTIALS');
    }
  });
  it('未登入 401；其他三種角色登入後仍無 ADMIN 權限', async () => {
    await request(app).get('/api/users').expect(401);
    for (const role of ['MANAGER', 'CASHIER', 'KITCHEN'] as const) {
      const { agent } = await login(members.get(role)!);
      await agent.get('/api/users').expect(403);
      await agent.post('/api/users').send({}).expect(403);
    }
  });
  it('新增、搜尋與修改使用者；密碼確為 Argon2id，大小寫 Email 去重', async () => {
    const { agent, csrf } = await login();
    const email = `${randomUUID()}@${domain}`;
    const created = await agent
      .post('/api/users')
      .set('Origin', env.APP_ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ email, displayName: '新增成員', role: 'CASHIER', password })
      .expect(201);
    const id = String(created.body.data.user.id);
    userIds.add(id);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    await agent
      .post('/api/users')
      .set('Origin', env.APP_ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ email: email.toUpperCase(), displayName: '重複', role: 'CASHIER', password })
      .expect(409);
    await agent
      .patch(`/api/users/${id}`)
      .set('Origin', env.APP_ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ displayName: '已修改成員' })
      .expect(200);
    const found = await agent
      .get(`/api/users?q=${encodeURIComponent(email)}&role=CASHIER&isActive=true`)
      .expect(200);
    expect(found.body.data.total).toBe(1);
    expect(found.body.data.items[0].displayName).toBe('已修改成員');
  });
  it('停用後撤銷所有 Session，無法登入；只改姓名不會意外重新啟用', async () => {
    const target = await createMember();
    const first = await login(target);
    const second = await login(target);
    const manager = await login();
    await manager.agent
      .patch(`/api/users/${target.id}`)
      .set('Origin', env.APP_ORIGIN)
      .set('X-CSRF-Token', manager.csrf)
      .send({ isActive: false })
      .expect(200);
    expect(await prisma.session.count({ where: { userId: target.id } })).toBe(0);
    await first.agent.get('/api/auth/me').expect(401);
    await second.agent.get('/api/auth/me').expect(401);
    const initial = await first.agent.get('/api/auth/session');
    await first.agent
      .post('/api/auth/login')
      .set('Origin', env.APP_ORIGIN)
      .set('X-CSRF-Token', initial.body.data.csrfToken)
      .send({ email: target.email, password })
      .expect(401);
    await manager.agent
      .patch(`/api/users/${target.id}`)
      .set('Origin', env.APP_ORIGIN)
      .set('X-CSRF-Token', manager.csrf)
      .send({ displayName: '仍停用' })
      .expect(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).isActive).toBe(
      false,
    );
    await manager.agent
      .patch(`/api/users/${target.id}`)
      .set('Origin', env.APP_ORIGIN)
      .set('X-CSRF-Token', manager.csrf)
      .send({ isActive: true })
      .expect(200);
    await login(target);
  });
  it('角色與密碼變更均撤銷舊 Session，重新登入取得新角色', async () => {
    const target = await createMember();
    const old = await login(target);
    const actor = await login();
    const secret = randomBytes(24).toString('base64url');
    await actor.agent
      .patch(`/api/users/${target.id}`)
      .set('Origin', env.APP_ORIGIN)
      .set('X-CSRF-Token', actor.csrf)
      .send({ role: 'KITCHEN', password: secret })
      .expect(200);
    await old.agent.get('/api/auth/me').expect(401);
    const relogged = await login(target, secret);
    expect(relogged.response.body.data.user.role).toBe('KITCHEN');
  });
  it('CSRF 欠缺／錯誤或 Origin 不符時拒絕寫入；禁止修改自己角色及停用自己', async () => {
    const { agent, csrf } = await login();
    await agent
      .patch(`/api/users/${admin.id}`)
      .set('Origin', env.APP_ORIGIN)
      .send({ displayName: '不可寫入' })
      .expect(403);
    await agent
      .patch(`/api/users/${admin.id}`)
      .set('Origin', 'https://untrusted.example')
      .set('X-CSRF-Token', csrf)
      .send({ displayName: '不可寫入' })
      .expect(403);
    await agent
      .patch(`/api/users/${admin.id}`)
      .set('Origin', env.APP_ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ isActive: false })
      .expect(409);
    await agent
      .patch(`/api/users/${admin.id}`)
      .set('Origin', env.APP_ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ role: 'MANAGER' })
      .expect(409);
  });
  it('登出後原 Cookie 與舊 CSRF 不可重用', async () => {
    const { agent, csrf, cookie } = await login();
    await agent
      .post('/api/auth/logout')
      .set('Origin', env.APP_ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({})
      .expect(200);
    await request(app).get('/api/auth/me').set('Cookie', cookie).expect(401);
    await request(app)
      .post('/api/auth/login')
      .set('Cookie', cookie)
      .set('Origin', env.APP_ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ email: admin.email, password })
      .expect(403);
  });
  it('登入限流保存於 PostgreSQL，超額回 429 與 Retry-After', async () => {
    const agent = request.agent(app);
    const initial = await agent.get('/api/auth/session');
    const email = `${randomUUID()}@${domain}`;
    for (let i = 0; i < env.LOGIN_RATE_LIMIT_ACCOUNT; i++)
      await agent
        .post('/api/auth/login')
        .set('Origin', env.APP_ORIGIN)
        .set('X-CSRF-Token', initial.body.data.csrfToken)
        .send({ email, password })
        .expect(401);
    const blocked = await agent
      .post('/api/auth/login')
      .set('Origin', env.APP_ORIGIN)
      .set('X-CSRF-Token', initial.body.data.csrfToken)
      .send({ email, password })
      .expect(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });
  it('驗證密碼後帳號才被停用時，交易仍拒絕建立新的登入 Session', async () => {
    const target = await createMember();
    const bootstrap = new AuthService(repository).issue(null, null);
    sessionIds.add(bootstrap.session.id);
    await repository.createAnonymousSession(bootstrap.session);
    await authRepository.updateUser({ id: admin.id, authVersion: admin.authVersion }, target.id, {
      isActive: false,
    });
    const issued = new AuthService(repository).issue(target.id, target.authVersion);
    sessionIds.add(issued.session.id);
    await expect(
      repository.rotateSession(bootstrap.session.id, target, issued.session),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(await prisma.session.count({ where: { userId: target.id } })).toBe(0);
  });
  it('Session 絕對期限過後無法繼續使用；bootstrap 不覆寫既有管理員', async () => {
    const { cookie } = await login();
    const raw = cookie.slice(cookie.indexOf('=') + 1);
    await prisma.session.update({
      where: { id: hashToken(raw) },
      data: { expiresAt: new Date(0) },
    });
    await request(app).get('/api/auth/me').set('Cookie', cookie).expect(401);
    await expect(
      authRepository.bootstrapAdmin({
        email: `${randomUUID()}@${domain}`,
        displayName: '不可覆寫',
        role: 'ADMIN',
        isActive: true,
        passwordHash: digest,
      }),
    ).rejects.toMatchObject({ code: 'ADMIN_EXISTS' });
  });
});
