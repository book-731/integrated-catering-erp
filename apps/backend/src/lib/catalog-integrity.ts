import type { CheckConstraint } from './migration-integrity.js';
export interface FunctionalIndex {
  name: string;
  table_name: string;
  expression: string;
  is_valid: boolean;
  is_unique: boolean;
}
const checks = [
  {
    name: 'sessions_identity_consistent',
    table: 'sessions',
    expression: 'userIdISNULL=authVersionISNULL',
  },
  { name: 'auth_rate_limit_count_positive', table: 'auth_rate_limits', expression: 'count>0' },
  {
    name: 'menu_items_recipe_version_nonnegative',
    table: 'menu_items',
    expression: 'recipeVersion>=0',
  },
];
const indexes = [
  { name: 'users_email_lower_key', table: 'users', expression: 'loweremail' },
  { name: 'ingredients_sku_normalized_key', table: 'ingredients', expression: 'lowerbtrimsku' },
  {
    name: 'menu_categories_name_normalized_key',
    table: 'menu_categories',
    expression: 'lowerbtrimname',
  },
];
const normalized = (value: string) =>
  value.replace(/::(?:numeric|integer|text)/g, '').replace(/CHECK|[\s()"]/g, '');
export function assertCatalogIntegrity(
  constraints: readonly CheckConstraint[],
  definitions: readonly FunctionalIndex[],
): void {
  for (const expected of checks) {
    const actual = constraints.find((value) => value.name === expected.name);
    if (
      !actual?.validated ||
      actual.table_name !== expected.table ||
      normalized(actual.definition) !== expected.expression
    )
      throw new Error('資料庫驗證／配方 CHECK 約束缺失或定義不一致。');
  }
  for (const expected of indexes) {
    const actual = definitions.find((value) => value.name === expected.name);
    if (
      !actual?.is_unique ||
      !actual.is_valid ||
      actual.table_name !== expected.table ||
      normalized(actual.expression) !== expected.expression
    )
      throw new Error('資料庫大小寫去重索引缺失、失效或定義不一致。');
  }
}
