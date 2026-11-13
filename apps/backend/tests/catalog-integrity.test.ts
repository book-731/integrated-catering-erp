import { describe, it, expect } from 'vitest';
import { assertCatalogIntegrity, type FunctionalIndex } from '../src/lib/catalog-integrity.js';
import type { CheckConstraint } from '../src/lib/migration-integrity.js';
const checks: CheckConstraint[] = [
  {
    name: 'sessions_identity_consistent',
    table_name: 'sessions',
    definition: 'CHECK (("userId" IS NULL) = ("authVersion" IS NULL))',
    validated: true,
  },
  {
    name: 'auth_rate_limit_count_positive',
    table_name: 'auth_rate_limits',
    definition: 'CHECK ((count > 0))',
    validated: true,
  },
  {
    name: 'menu_items_recipe_version_nonnegative',
    table_name: 'menu_items',
    definition: 'CHECK (("recipeVersion" >= 0))',
    validated: true,
  },
];
const indexes: FunctionalIndex[] = [
  {
    name: 'users_email_lower_key',
    table_name: 'users',
    expression: 'lower((email)::text)',
    is_valid: true,
    is_unique: true,
  },
  {
    name: 'ingredients_sku_normalized_key',
    table_name: 'ingredients',
    expression: 'lower(btrim((sku)::text))',
    is_valid: true,
    is_unique: true,
  },
  {
    name: 'menu_categories_name_normalized_key',
    table_name: 'menu_categories',
    expression: 'lower(btrim((name)::text))',
    is_valid: true,
    is_unique: true,
  },
];
describe('新增 SQL 約束與 functional index 完整性', () => {
  it('接受已驗證的 Session／配方 CHECK 與大小寫去重索引', () =>
    expect(() => assertCatalogIntegrity(checks, indexes)).not.toThrow());
  it('拒絕約束缺失或規則漂移', () => {
    expect(() => assertCatalogIntegrity(checks.slice(0, 2), indexes)).toThrow();
    expect(() =>
      assertCatalogIntegrity(
        checks.map((value) => ({ ...value, definition: 'CHECK (true)' })),
        indexes,
      ),
    ).toThrow();
  });
  it('拒絕非唯一、失效或錯誤的正規化索引', () => {
    for (const change of [{ is_unique: false }, { is_valid: false }, { expression: 'lower(name)' }])
      expect(() =>
        assertCatalogIntegrity(
          checks,
          indexes.map((value, index) => (index === 0 ? { ...value, ...change } : value)),
        ),
      ).toThrow();
  });
});
