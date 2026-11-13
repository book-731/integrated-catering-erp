import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
const app = createApp({ healthRepository: { ping: async () => {} } });
afterAll(() => prisma.$disconnect());

describe('HTTP API 與錯誤契約（資料存取層注入，無真實資料庫）', () => {
  it('回傳健康狀態與可追蹤的 request ID，禁止快取', async () => {
    const response = await request(app).get('/api/health').expect(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { status: 'ok', database: { status: 'up' } },
    });
    expect(response.body.requestId).toBe(response.headers['x-request-id']);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
  it('資料庫失敗時回傳 503，回應不包含敏感錯誤內容', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sensitiveMarker = 'private-database-error-sentinel';
    try {
      const unavailable = createApp({
        healthRepository: {
          ping: async () => {
            throw new Error(sensitiveMarker);
          },
        },
      });
      const response = await request(unavailable).get('/api/health').expect(503);
      expect(response.body).toMatchObject({
        success: false,
        error: { code: 'DATABASE_UNAVAILABLE' },
      });
      expect(JSON.stringify(response.body)).not.toContain(sensitiveMarker);
      expect(JSON.stringify(log.mock.calls)).not.toContain(sensitiveMarker);
    } finally {
      log.mockRestore();
    }
  });
  it('不存在的 API 回傳統一 404', async () => {
    const response = await request(app).get('/api/missing').expect(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
  it('不合法的 JSON 回傳統一 400', async () => {
    const response = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{broken')
      .expect(400);
    expect(response.body.error.code).toBe('INVALID_JSON');
  });
  it('超過大小限制回傳 413', async () => {
    const response = await request(app)
      .post('/api/health')
      .send({ value: 'x'.repeat(110000) })
      .expect(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
  it('拒絕未允許的跨域來源', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Origin', 'https://untrusted.example')
      .expect(403);
    expect(response.body.error.code).toBe('ORIGIN_NOT_ALLOWED');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('允許設定的前端來源與預檢請求', async () => {
    const response = await request(app)
      .options('/api/health')
      .set('Origin', process.env.CORS_ORIGIN ?? 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET')
      .expect(204);
    expect(response.headers['access-control-allow-origin']).toBe(
      process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    );
  });
  it('提供機器可讀的 OpenAPI 與 Swagger UI', async () => {
    const spec = await request(app).get('/api/openapi.json').expect(200);
    expect(spec.body.openapi).toBe('3.0.3');
    expect(spec.body.paths['/health'].get.responses['503']).toBeDefined();
    const docs = await request(app).get('/api/docs/').expect(200);
    expect(docs.text).toContain('swagger-ui');
  });
});
