import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { env, trustedOrigins } from './config/env.js';
import { ApiError } from './common/api-error.js';
import { requestContext } from './middleware/request-context.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
import { healthRepository, type HealthRepository } from './modules/health/health.repository.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { openApiDocument } from './openapi.js';
import { authRepository } from './modules/auth/auth.repository.js';
import type { AuthRepository } from './modules/auth/auth.repository.interface.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { usersRoutes } from './modules/users/users.routes.js';
import { catalogRoutes } from './modules/catalog/catalog.routes.js';
import { operationsRoutes } from './modules/operations/routes.js';

export function createApp(
  dependencies: { healthRepository?: HealthRepository; authRepository?: AuthRepository } = {},
) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.use(requestContext);
  app.use(helmet());
  app.use('/api', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || trustedOrigins.has(origin)) {
          callback(null, true);
          return;
        }
        callback(new ApiError(403, 'ORIGIN_NOT_ALLOWED', '此來源不允許存取 API。'));
      },
      exposedHeaders: ['X-Request-ID'],
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use('/api/health', healthRoutes(dependencies.healthRepository ?? healthRepository));
  const securityRepository = dependencies.authRepository ?? authRepository;
  app.use('/api/auth', authRoutes(securityRepository));
  app.use('/api/users', usersRoutes(securityRepository));
  app.use('/api', catalogRoutes(securityRepository));
  app.use('/api/operations', operationsRoutes(securityRepository));
  app.get('/api/openapi.json', (request, response) => {
    response.json(openApiDocument);
  });
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, { customSiteTitle: '第 12 組 ERP API' }),
  );
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
