export interface LocalMigration {
  name: string;
  checksums: readonly string[];
}

export interface AppliedMigration {
  migration_name: string;
  checksum: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
}

export interface CheckConstraint {
  name: string;
  table_name: string;
  definition: string;
  validated: boolean;
}

export function assertMigrationIntegrity(
  local: readonly LocalMigration[],
  database: readonly AppliedMigration[],
): void {
  const active = database.filter((migration) => migration.rolled_back_at === null);
  if (active.some((migration) => migration.finished_at === null)) {
    throw new Error('資料庫含有未完成的 migration；請先人工確認，禁止自動 reset。');
  }
  if (active.length !== local.length) throw new Error('本機與資料庫 migration 數量不一致。');
  for (const migration of local) {
    const applied = active.filter((row) => row.migration_name === migration.name);
    if (applied.length !== 1 || !migration.checksums.includes(applied[0]!.checksum)) {
      throw new Error('Migration 名稱或 checksum 不一致；請勿修改已套用的 SQL。');
    }
  }
}

const expectedChecks = [
  { name: 'ingredients_stock_nonnegative', table: 'ingredients', expression: 'stockQuantity>=0' },
  { name: 'ingredients_safety_nonnegative', table: 'ingredients', expression: 'safetyStock>=0' },
  { name: 'menu_items_price_nonnegative', table: 'menu_items', expression: 'price>=0' },
  { name: 'recipe_quantity_positive', table: 'recipe_ingredients', expression: 'quantity>0' },
] as const;

export function assertCheckConstraints(constraints: readonly CheckConstraint[]): void {
  for (const expected of expectedChecks) {
    const actual = constraints.find((constraint) => constraint.name === expected.name);
    const expression = actual?.definition
      .replace(/::(?:numeric|integer)/g, '')
      .replace(/CHECK|[\s()"]/g, '');
    if (
      !actual?.validated ||
      actual.table_name !== expected.table ||
      expression !== expected.expression
    ) {
      throw new Error('資料庫 CHECK 約束缺失、尚未驗證或規則與初始 Migration 不一致。');
    }
  }
}
