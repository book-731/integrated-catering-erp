import { Router } from 'express';
import { healthController } from './health.controller.js';
import { HealthService } from './health.service.js';
import type { HealthRepository } from './health.repository.js';
export function healthRoutes(repository: HealthRepository): Router {
  const router = Router();
  router.get('/', healthController(new HealthService(repository)));
  return router;
}
