import { Router } from 'express';
import { authController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { loadSession, protectCsrf, requireAuthenticated } from './auth.middleware.js';
import type { AuthRepository } from './auth.repository.interface.js';
export function authRoutes(repository: AuthRepository) {
  const router = Router();
  const service = new AuthService(repository);
  const controller = authController(service);
  router.get('/session', controller.session);
  router.get('/me', loadSession(service), requireAuthenticated, controller.me);
  router.post('/login', loadSession(service), protectCsrf, controller.login);
  router.post('/logout', loadSession(service), protectCsrf, controller.logout);
  return router;
}
