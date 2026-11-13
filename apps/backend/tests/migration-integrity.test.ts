import { describe, expect, it } from 'vitest';
import {
  assertCheckConstraints,
  assertMigrationIntegrity,
  type AppliedMigration,
  type CheckConstraint,
} from '../src/lib/migration-integrity.js';

const local = [{ name: 'initial', checksums: ['expected'] }];
const applied: AppliedMigration = {
  migration_name: 'initial',
  checksum: 'expected',
  finished_at: new Date(),
  rolled_back_at: null,
};
const checks: CheckConstraint[] = [
  {
    name: 'ingredients_stock_nonnegative',
    table_name: 'ingredients',
    definition: 'CHECK (("stockQuantity" >= (0)::numeric))',
    validated: true,
  },
  {
    name: 'ingredients_safety_nonnegative',
    table_name: 'ingredients',
    definition: 'CHECK (("safetyStock" >= (0)::numeric))',
    validated: true,
  },
  {
    name: 'menu_items_price_nonnegative',
    table_name: 'menu_items',
    definition: 'CHECK ((price >= (0)::numeric))',
    validated: true,
  },
  {
    name: 'recipe_quantity_positive',
    table_name: 'recipe_ingredients',
    definition: 'CHECK ((quantity > (0)::numeric))',
    validated: true,
  },
];

describe('Migration 驗收防護', () => {
  it('接受完整且一致的 migration 與 CHECK constraints', () => {
    expect(() => assertMigrationIntegrity(local, [applied])).not.toThrow();
    expect(() => assertCheckConstraints(checks)).not.toThrow();
  });
  it('拒絕 SQL 被改寫、版本缺少或未完成，不能誤報同步', () => {
    expect(() => assertMigrationIntegrity(local, [{ ...applied, checksum: 'changed' }])).toThrow(
      /checksum/,
    );
    expect(() => assertMigrationIntegrity(local, [])).toThrow(/數量/);
    expect(() => assertMigrationIntegrity(local, [{ ...applied, finished_at: null }])).toThrow(
      /未完成/,
    );
  });
  it('拒絕被移除、改弱或尚未驗證的 CHECK 約束', () => {
    expect(() => assertCheckConstraints(checks.slice(1))).toThrow(/CHECK/);
    expect(() =>
      assertCheckConstraints(
        checks.map((check) =>
          check.name === 'recipe_quantity_positive'
            ? { ...check, definition: 'CHECK ((quantity >= 0))' }
            : check,
        ),
      ),
    ).toThrow(/CHECK/);
    expect(() =>
      assertCheckConstraints(checks.map((check) => ({ ...check, validated: false }))),
    ).toThrow(/CHECK/);
  });
});
