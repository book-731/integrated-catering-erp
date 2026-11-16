import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { createPrismaClient } from '../src/lib/prisma.js';
import { dateWindow } from '../src/modules/operations/reports.service.js';
import type { Query } from '../src/modules/operations/validation.js';

if (process.env.RUN_DB_INTEGRATION !== '1')
  throw new Error('請從 npm run test:integration 啟動隔離資料庫測試。');

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) throw new Error('缺少 DATABASE_URL 環境變數。');

const url = new URL(rawUrl);
url.searchParams.set('options', '-c TimeZone=Asia/Taipei');
const taipeiUrl = url.href;

const client = createPrismaClient(taipeiUrl);
afterAll(() => client.$disconnect());

describe('Prisma 連線時區強制與跨午夜時間', () => {
  it('對照組：未經處理的連線確實是台北時區', async () => {
    const raw = new PrismaClient({ adapter: new PrismaPg({ connectionString: taipeiUrl }) });
    try {
      const [row] = await raw.$queryRaw<[{ TimeZone: string }]>`SHOW TimeZone`;
      expect(row.TimeZone).toBe('Asia/Taipei');
    } finally {
      await raw.$disconnect();
    }
  });

  it('createPrismaClient 蓋過網址的台北時區，連線為 UTC', async () => {
    const [row] = await client.$queryRaw<[{ TimeZone: string }]>`SHOW TimeZone`;
    expect(row.TimeZone).toBe('UTC');
  });

  it('跨午夜時間寫入讀回不變，且落在正確的台北日期', async () => {
    const beforeMidnight = new Date('2026-11-12T23:59:59.999+08:00'); // 15:59:59.999Z
    const midnight = new Date('2026-11-13T00:00:00+08:00'); // 16:00:00.000Z
    const { start, end } = dateWindow({ from: '2026-11-13', to: '2026-11-13' } as Query);
    await client.$transaction(async (tx) => {
      await tx.$executeRaw`CREATE TEMP TABLE tz_probe (id int, at timestamptz(3)) ON COMMIT DROP`;
      await tx.$executeRaw`INSERT INTO tz_probe VALUES (1, ${beforeMidnight}), (2, ${midnight})`;
      const rows = await tx.$queryRaw<
        { id: number; at: Date }[]
      >`SELECT id, at FROM tz_probe ORDER BY id`;
      expect(rows.map((r) => r.at.toISOString())).toEqual([
        '2026-11-12T15:59:59.999Z',
        '2026-11-12T16:00:00.000Z',
      ]);
      const inDay = await tx.$queryRaw<{ id: number }[]>`
        SELECT id FROM tz_probe WHERE at >= ${start} AND at < ${end} ORDER BY id`;
      expect(inDay.map((r) => r.id)).toEqual([2]);
    });
  });
});
