import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { prisma } from '../src/lib/prisma.js';
import { assertCatalogIntegrity, type FunctionalIndex } from '../src/lib/catalog-integrity.js';
import {
  assertCheckConstraints,
  assertMigrationIntegrity,
  type AppliedMigration,
  type CheckConstraint,
} from '../src/lib/migration-integrity.js';

try {
  const directory = new URL('../prisma/migrations/', import.meta.url);
  const folders = (await readdir(directory, { withFileTypes: true })).filter((entry) =>
    entry.isDirectory(),
  );
  const local = await Promise.all(
    folders.map(async (folder) => {
      const sql = await readFile(new URL(`${folder.name}/migration.sql`, directory), 'utf8');
      const lf = sql.replace(/\r\n/g, '\n');
      // Prisma 支援跨平台換行；不改寫已套用的 migration 檔案。
      const checksums = [sql, lf, lf.replace(/\n/g, '\r\n')].map((text) =>
        createHash('sha256').update(text).digest('hex'),
      );
      return { name: folder.name, checksums };
    }),
  );
  await prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SET TRANSACTION READ ONLY`;
    const migrations = await transaction.$queryRaw<AppliedMigration[]>`
      SELECT migration_name, checksum, finished_at, rolled_back_at
      FROM public._prisma_migrations ORDER BY started_at`;
    const constraints = await transaction.$queryRaw<CheckConstraint[]>`
      SELECT c.conname AS name, t.relname AS table_name,
             pg_get_constraintdef(c.oid) AS definition, c.convalidated AS validated
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND c.contype = 'c'`;
    assertMigrationIntegrity(local, migrations);
    assertCheckConstraints(constraints);
    const operational = [
      'bundle_positive',
      'group_limits',
      'option_price',
      'option_quantity',
      'movement_balanced',
      'order_totals',
      'order_state',
      'line_totals',
      'purchase_quantities',
      'shift_interval',
      'attendance_interval',
      'leave_interval',
    ];
    if (operational.some((name) => !constraints.some((c) => c.name === name && c.validated)))
      throw new Error('資料庫業務 CHECK 約束遺失或未驗證。');
    const indexes = await transaction.$queryRaw<FunctionalIndex[]>`
      SELECT ic.relname AS name,t.relname AS table_name,pg_get_expr(i.indexprs,i.indrelid) AS expression,
             i.indisvalid AS is_valid,i.indisunique AS is_unique
      FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid
      JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname='public' AND i.indexprs IS NOT NULL`;
    assertCatalogIntegrity(constraints, indexes);
  });
  console.log(
    `唯讀資料庫檢查通過：${local.length} 版 Migration checksum、19 項 CHECK 及 3 個去重索引一致。`,
  );
} catch (error) {
  const known = error instanceof Error && /^(本機|資料庫|Migration)/.test(error.message);
  console.error(
    known ? error.message : '資料庫完整性檢查失敗；請確認連線、Migration 與資料表狀態。',
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
