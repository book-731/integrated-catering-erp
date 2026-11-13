import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

if (process.env.RUN_DB_INTEGRATION !== '1')
  throw new Error('請從 npm run test:integration 啟動隔離資料庫測試。');
afterAll(() => prisma.$disconnect());

describe('真實 PostgreSQL + Prisma + Express 整合', () => {
  it('透過實際資料庫查詢回傳健康狀態', async () => {
    const response = await request(createApp()).get('/api/health').expect(200);
    expect(response.body.data.database).toMatchObject({ status: 'up' });
    expect(response.body.data.database.latencyMs).toBeGreaterThanOrEqual(0);
  });
  it('Migration 可儲存食材配方，交易 rollback 不殘留測試資料', async () => {
    class Rollback extends Error {}
    let ingredientId = '';
    await expect(
      prisma.$transaction(async (tx) => {
        const ingredient = await tx.ingredient.create({
          data: {
            sku: `test-${crypto.randomUUID()}`,
            name: '整合測試食材',
            unit: 'g',
            stockQuantity: '1000.000',
          },
        });
        ingredientId = ingredient.id;
        const category = await tx.menuCategory.create({
          data: { name: `test-${crypto.randomUUID()}` },
        });
        const item = await tx.menuItem.create({
          data: {
            name: '整合測試餐點',
            price: '120.50',
            categoryId: category.id,
            recipes: { create: { ingredientId, quantity: '125.500' } },
          },
          include: { recipes: true },
        });
        expect(item.price.toFixed(2)).toBe('120.50');
        expect(item.recipes[0]?.quantity.toFixed(3)).toBe('125.500');
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);
    expect(await prisma.ingredient.findUnique({ where: { id: ingredientId } })).toBeNull();
  });
  it('資料庫拒絕負庫存與零用量配方', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.ingredient.create({
          data: {
            sku: `test-${crypto.randomUUID()}`,
            name: '無效資料',
            unit: 'g',
            stockQuantity: '-1',
          },
        });
        // 即使 CHECK 意外消失，也不提交無效資料；斷線等錯誤不能冒充約束驗證通過。
        throw new Error('資料庫意外接受無效數值，已回滾。');
      }),
    ).rejects.toThrow(/ingredients_stock_nonnegative/);
    await expect(
      prisma.$transaction(async (tx) => {
        const ingredient = await tx.ingredient.create({
          data: { sku: `test-${crypto.randomUUID()}`, name: '測試食材', unit: 'g' },
        });
        const category = await tx.menuCategory.create({
          data: { name: `test-${crypto.randomUUID()}` },
        });
        await tx.menuItem.create({
          data: {
            name: '測試餐點',
            price: '1',
            categoryId: category.id,
            recipes: { create: { ingredientId: ingredient.id, quantity: '0' } },
          },
        });
        throw new Error('資料庫意外接受無效數值，已回滾。');
      }),
    ).rejects.toThrow(/recipe_quantity_positive/);
  });
});
