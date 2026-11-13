import type { RequestHandler } from 'express';
import { sendSuccess } from '../../common/http.js';
import type { HealthService } from './health.service.js';
export function healthController(service: HealthService): RequestHandler {
  return async (request, response) => {
    sendSuccess(request, response, await service.check());
  };
}
