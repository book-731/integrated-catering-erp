import { authPaths, authSchemas, authSecuritySchemes } from './modules/auth/auth.openapi.js';
import { catalogPaths, catalogSchemas } from './modules/catalog/catalog.openapi.js';
import { operationsPaths, operationsSchemas } from './modules/operations/openapi.js';

const errorSchema = {
  type: 'object',
  required: ['success', 'error', 'requestId'],
  properties: {
    success: { type: 'boolean', enum: [false] },
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: { code: { type: 'string' }, message: { type: 'string' } },
    },
    requestId: { type: 'string', format: 'uuid' },
  },
};
const errorResponse = (description: string) => ({
  description,
  headers: { 'X-Request-ID': { schema: { type: 'string', format: 'uuid' } } },
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
});

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: '第 12 組｜餐飲業整合型 ERP API',
    version: '0.4.0',
    description:
      'Windows單店ERP：Session、CSRF、RBAC，菜單／套餐／客製化、庫存流水、訂單快照與扣庫、採購收貨、人事排班及真實營運報表。寫入需 Cookie、Origin、CSRF；新業務命令另需 requestKey。',
  },
  servers: [{ url: '/api', description: '同源 API；本機使用 Vite Proxy，容器使用 Nginx Proxy' }],
  tags: [
    { name: 'System', description: '系統基礎' },
    { name: 'Auth', description: '登入狀態與 Session' },
    { name: 'Users', description: 'ADMIN 使用者管理' },
    { name: 'Ingredients', description: '食材基礎資料；無庫存寫入' },
    { name: 'Menu', description: '菜單分類與一般餐點' },
    { name: 'Recipes', description: '配方與樂觀鎖版本' },
  ],
  paths: {
    ...catalogPaths,
    ...operationsPaths,
    ...authPaths,
    '/health': {
      get: {
        tags: ['System'],
        operationId: 'getHealth',
        summary: '檢查 API 與 PostgreSQL 連線',
        responses: {
          '200': {
            description: 'API 可用且資料庫查詢成功',
            headers: { 'X-Request-ID': { schema: { type: 'string', format: 'uuid' } } },
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/HealthResponse' } },
            },
          },
          '503': errorResponse('PostgreSQL 查詢失敗，錯誤碼 DATABASE_UNAVAILABLE'),
          '403': errorResponse('CORS 來源未授權，錯誤碼 ORIGIN_NOT_ALLOWED'),
          '500': errorResponse('未預期的伺服器錯誤'),
        },
      },
    },
    '/openapi.json': {
      get: {
        tags: ['System'],
        operationId: 'getOpenApi',
        summary: '取得 OpenAPI 規格',
        responses: {
          '200': {
            description: 'OpenAPI 3.0.3 JSON 文件',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: authSecuritySchemes,
    schemas: {
      ...catalogSchemas,
      ...operationsSchemas,
      ...authSchemas,
      ApiError: errorSchema,
      HealthResponse: {
        type: 'object',
        required: ['success', 'data', 'requestId'],
        properties: {
          success: { type: 'boolean', enum: [true] },
          requestId: { type: 'string', format: 'uuid' },
          data: {
            type: 'object',
            required: ['status', 'service', 'version', 'timestamp', 'database'],
            properties: {
              status: { type: 'string', enum: ['ok'] },
              service: { type: 'string', example: 'restaurant-erp-api' },
              version: { type: 'string', example: '0.4.0' },
              timestamp: { type: 'string', format: 'date-time' },
              database: {
                type: 'object',
                required: ['status', 'latencyMs'],
                properties: {
                  status: { type: 'string', enum: ['up'] },
                  latencyMs: { type: 'number', minimum: 0 },
                },
              },
            },
          },
        },
      },
    },
  },
};
