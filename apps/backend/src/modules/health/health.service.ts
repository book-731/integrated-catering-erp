import { performance } from 'node:perf_hooks';
import { ApiError } from '../../common/api-error.js';
import type { HealthRepository } from './health.repository.js';

export class HealthService {
  constructor(private readonly repository: HealthRepository) {}
  async check() {
    const start = performance.now();
    try {
      await this.repository.ping();
    } catch {
      throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'API 已啟動，但無法連線至資料庫。');
    }
    return {
      status: 'ok' as const,
      service: 'restaurant-erp-api',
      version: '0.4.0',
      timestamp: new Date().toISOString(),
      database: {
        status: 'up' as const,
        latencyMs: Math.round((performance.now() - start) * 100) / 100,
      },
    };
  }
}
