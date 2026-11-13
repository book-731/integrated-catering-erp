import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
describe('正式環境 Cookie 與 origin 設定', () => {
  it('HTTPS 預設使用 __Host-、Secure、HttpOnly、SameSite=Lax 且不設定 Domain', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SESSION_COOKIE_SECURE', 'true');
    vi.stubEnv('APP_ORIGIN', 'https://erp.example.test');
    const { setSessionCookie, clearSessionCookie, sessionCookieName } =
      await import('../src/modules/auth/auth.middleware.js');
    const cookie = vi.fn();
    const clearCookie = vi.fn();
    const response = { cookie, clearCookie } as unknown as Response;
    setSessionCookie(response, 'runtime-token', new Date(Date.now() + 10000));
    clearSessionCookie(response);
    expect(sessionCookieName).toBe('__Host-erp.sid');
    expect(cookie.mock.calls[0]?.[2]).toMatchObject({
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
    expect(cookie.mock.calls[0]?.[2]).not.toHaveProperty('domain');
    expect(clearCookie.mock.calls[0]?.[1]).toMatchObject({
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
  });
  it.each([
    ['https://erp.example.test', 'false'],
    ['http://erp.example.test', 'true'],
    ['https://erp.example.test/path', 'true'],
  ])('拒絕不安全或非 origin 設定：%s / %s', async (origin, secure) => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ORIGIN', origin);
    vi.stubEnv('SESSION_COOKIE_SECURE', secure);
    await expect(import('../src/config/env.js')).rejects.toThrow();
  });
});
