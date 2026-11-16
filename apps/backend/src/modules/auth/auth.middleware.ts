import { timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import { ApiError } from '../../common/api-error.js';
import { env, trustedOrigins } from '../../config/env.js';
import type { AuthService } from './auth.service.js';
import type { Actor, Role } from './auth.types.js';
import { normalizeMediaType } from '../catalog/menu-image-storage.js';
export const sessionCookieName = env.SESSION_COOKIE_SECURE ? '__Host-erp.sid' : 'erp.sid';
const cookieOptions = {
  httpOnly: true,
  secure: env.SESSION_COOKIE_SECURE,
  sameSite: 'lax' as const,
  path: '/',
};
export function readSessionCookie(request: Request): string | undefined {
  const values = request.headers.cookie
    ?.split(';')
    .map((value) => value.trim())
    .filter((value) => value.startsWith(`${sessionCookieName}=`));
  return values?.length === 1 ? values[0]?.slice(sessionCookieName.length + 1) : undefined;
}
export function setSessionCookie(response: Response, token: string, expiresAt: Date) {
  response.cookie(sessionCookieName, token, {
    ...cookieOptions,
    maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
  });
}
export function clearSessionCookie(response: Response) {
  response.clearCookie(sessionCookieName, cookieOptions);
}
export function loadSession(service: AuthService): RequestHandler {
  return async (request, _response, next) => {
    request.authContext = await service.read(readSessionCookie(request));
    next();
  };
}
export const requireAuthenticated: RequestHandler = (request, response, next) => {
  if (!request.authContext?.user) {
    clearSessionCookie(response);
    next(new ApiError(401, 'UNAUTHENTICATED', '請先登入系統。'));
    return;
  }
  next();
};
export function requireRoles(...roles: Role[]): RequestHandler {
  return (request, _response, next) => {
    if (!request.authContext?.user) {
      next(new ApiError(401, 'UNAUTHENTICATED', '請先登入系統。'));
      return;
    }
    if (!roles.includes(request.authContext.user.role)) {
      next(new ApiError(403, 'FORBIDDEN', '你沒有操作此功能的權限。'));
      return;
    }
    next();
  };
}
export function protectCsrfFor(allowedMediaTypes?: readonly string[]): RequestHandler {
  return (request, _response, next) => {
    const origin = request.get('Origin');
    const expected = request.authContext?.session.csrfToken;
    const supplied = request.get('X-CSRF-Token');
    if (
      !origin ||
      !trustedOrigins.has(origin) ||
      !expected ||
      !supplied ||
      supplied.length > 128 ||
      Buffer.byteLength(expected) !== Buffer.byteLength(supplied) ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))
    ) {
      next(new ApiError(403, 'CSRF_INVALID', '安全驗證失敗，請重新整理登入狀態後再試。'));
      return;
    }
    if (allowedMediaTypes && allowedMediaTypes.length > 0) {
      const normalized = normalizeMediaType(request.get('Content-Type'));
      if (!normalized || !allowedMediaTypes.includes(normalized)) {
        const message =
          allowedMediaTypes.length === 1 && allowedMediaTypes[0] === 'application/json'
            ? '此操作需要 application/json。'
            : `此操作僅支援 ${allowedMediaTypes.join('、')}。`;
        next(new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', message));
        return;
      }
    }
    next();
  };
}
export const protectCsrf: RequestHandler = protectCsrfFor(['application/json']);
export function currentActor(request: Request): Actor {
  const user = request.authContext?.user;
  if (!user) throw new ApiError(401, 'UNAUTHENTICATED', '請先登入系統。');
  return { id: user.id, authVersion: user.authVersion };
}
