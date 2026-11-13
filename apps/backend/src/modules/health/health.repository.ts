import { prisma } from '../../lib/prisma.js';

export interface HealthRepository {
  ping(): Promise<void>;
}

export const healthRepository: HealthRepository = {
  async ping() {
    // 透過 Prisma 與 pg adapter 執行真實查詢；不回傳連線憑證。
    await prisma.$queryRaw`SELECT 1`;
  },
};
