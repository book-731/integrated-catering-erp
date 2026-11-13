import type { RequestHandler } from 'express';
import { ApiError } from '../../common/api-error.js';
import { sendSuccess } from '../../common/http.js';
import { clearSessionCookie, readSessionCookie, setSessionCookie } from './auth.middleware.js';
import type { AuthService } from './auth.service.js';
import { loginSchema, validate } from './auth.validation.js';
import { publicUser } from './auth.types.js';
export function authController(service: AuthService) {
  const session: RequestHandler = async (request, response) => {
    const result = await service.bootstrap(readSessionCookie(request), request.ip ?? 'unknown');
    if ('retryAfter' in result) {
      response.setHeader('Retry-After', result.retryAfter);
      throw new ApiError(429, 'RATE_LIMITED', '請求過於頻繁，請稍後再試。');
    }
    if (result.token) setSessionCookie(response, result.token, result.context.session.expiresAt);
    sendSuccess(request, response, service.data(result.context));
  };
  const login: RequestHandler = async (request, response) => {
    if (!request.authContext) throw new ApiError(403, 'CSRF_INVALID', '請重新整理登入頁面。');
    const result = await service.login(
      request.authContext,
      validate(loginSchema, request.body),
      request.ip ?? 'unknown',
    );
    if ('retryAfter' in result) {
      response.setHeader('Retry-After', result.retryAfter);
      throw new ApiError(429, 'RATE_LIMITED', '登入嘗試過於頻繁，請稍後再試。');
    }
    setSessionCookie(response, result.token, result.context.session.expiresAt);
    sendSuccess(request, response, service.data(result.context));
  };
  const logout: RequestHandler = async (request, response) => {
    if (request.authContext) await service.repository.deleteSession(request.authContext.session.id);
    clearSessionCookie(response);
    sendSuccess(request, response, { user: null });
  };
  const me: RequestHandler = (request, response) => {
    if (!request.authContext?.user) throw new ApiError(401, 'UNAUTHENTICATED', '請先登入系統。');
    sendSuccess(request, response, { user: publicUser(request.authContext.user) });
  };
  return { session, login, logout, me };
}
