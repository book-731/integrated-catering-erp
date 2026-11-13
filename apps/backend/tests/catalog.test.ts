import { describe, it, expect } from 'vitest';
import { Prisma } from '../src/generated/prisma/client.js';
import { ingredientDto } from '../src/modules/catalog/catalog.service.js';
import {
  catalogValidate,
  quantitySchema,
  priceSchema,
  positiveQuantitySchema,
  ingredientCreateSchema,
  ingredientUpdateSchema,
  menuCreateSchema,
  recipeReplaceSchema,
  categoryCreateSchema,
  availabilityQuerySchema,
} from '../src/modules/catalog/catalog.validation.js';

describe('Catalog 輸入與 Decimal 契約', () => {
  it.each(['0', '1.5', '1e2', '10001', '-1'])('足夠性查詢拒絕錯誤份數 %s', (servings) =>
    expect(availabilityQuerySchema.safeParse({ servings }).success).toBe(false),
  );
  it('足夠性查詢份數預設 1 且整數有界', () => {
    expect(availabilityQuerySchema.parse({}).servings).toBe(1);
    expect(availabilityQuerySchema.parse({ servings: '10000' }).servings).toBe(10000);
  });
  it.each(['0', '0.001', '99999999999.999'])('數量接受可精確保存的字串 %s', (value) =>
    expect(quantitySchema.safeParse(value).success).toBe(true),
  );
  it.each([-1, 1.23, '-0.001', '1e3', '1.0001', '100000000000', 'NaN', '01', ' 1 '])(
    '數量拒絕非契約輸入 %s',
    (value) => expect(quantitySchema.safeParse(value).success).toBe(false),
  );
  it.each(['-1', '0.001', '10000000000', 1.2])('金額拒絕負數、超精度、溢位及 number：%s', (value) =>
    expect(priceSchema.safeParse(value).success).toBe(false),
  );
  it.each(['0', '0.000', 'bad', 0])('配方拒絕零／錯誤數量，必須是驗證錯誤而非例外：%s', (value) =>
    expect(() => catalogValidate(positiveQuantitySchema, value)).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR', status: 422 }),
    ),
  );
  it('輸出固定 3 位字串，安全庫存比較完全以 Decimal 執行', () => {
    const value = ingredientDto({
      id: 'id',
      sku: 'RICE',
      name: '白米',
      unit: 'g',
      stockQuantity: new Prisma.Decimal('0.1').plus('0.2'),
      safetyStock: new Prisma.Decimal('0.3'),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(value.stockQuantity).toBe('0.300');
    expect(value.safetyStock).toBe('0.300');
    expect(value.isLowStock).toBe(true);
  });
  it('SKU 正規化、分類 trim，部分修改不意外重新啟用', () => {
    expect(
      ingredientCreateSchema.parse({ sku: ' rice-01 ', name: ' 白米 ', unit: 'g' }),
    ).toMatchObject({ sku: 'RICE-01', name: '白米', safetyStock: '0', isActive: true });
    expect(categoryCreateSchema.parse({ name: ' 主餐 ' })).toMatchObject({ name: '主餐' });
    expect(ingredientUpdateSchema.parse({ name: '白米' })).not.toHaveProperty('isActive');
  });
  it('新增／修改均禁止 stockQuantity，且不接受任意額外欄位', () => {
    expect(
      ingredientCreateSchema.safeParse({ sku: 'RICE', name: '米', unit: 'g', stockQuantity: '10' })
        .success,
    ).toBe(false);
    expect(ingredientUpdateSchema.safeParse({ stockQuantity: '10' }).success).toBe(false);
    expect(ingredientUpdateSchema.safeParse({}).success).toBe(false);
  });
  it.each([
    'javascript:alert(1)',
    'data:image/png;base64,abc',
    'https://user:secret@example.test/image',
    'bad',
  ])('圖片拒絕非 HTTP(S) 或帶帳密：%s', (imageUrl) => {
    expect(() =>
      catalogValidate(menuCreateSchema, {
        name: '餐點',
        categoryId: '12345678-1234-4234-8234-123456789012',
        price: '10.00',
        imageUrl,
      }),
    ).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });
  it('配方必須包含非負整數版本及完整單位', () => {
    expect(recipeReplaceSchema.safeParse({ expectedVersion: 0, items: [] }).success).toBe(true);
    expect(
      recipeReplaceSchema.safeParse({
        expectedVersion: 0,
        items: [{ ingredientId: '12345678-1234-4234-8234-123456789012', quantity: '1' }],
      }).success,
    ).toBe(false);
  });
});
