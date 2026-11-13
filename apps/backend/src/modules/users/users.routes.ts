import { Router } from 'express';
import { AuthService } from '../auth/auth.service.js';
import {
  loadSession,
  protectCsrf,
  requireAuthenticated,
  requireRoles,
} from '../auth/auth.middleware.js';
import type { AuthRepository } from '../auth/auth.repository.interface.js';
import { usersController } from './users.controller.js';
import { UsersService } from './users.service.js';
export function usersRoutes(repository: AuthRepository) {
  const router = Router();
  const controller = usersController(new UsersService(repository));
  router.use(loadSession(new AuthService(repository)), requireAuthenticated, requireRoles('ADMIN'));
  router.get('/', controller.list);
  router.post('/', protectCsrf, controller.create);
  router.patch('/:id', protectCsrf, controller.update);
  return router;
}
