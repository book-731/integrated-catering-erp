import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { ApiError } from '../../common/api-error.js';

export const quantitySchema = z
  .string()
  .regex(/^(0|[1-9]\d{0,10})(\.\d{1,3})?$/, '數量需為非負十進位字串，最多 11 位整數、3 位小數。');
export const priceSchema = z
  .string()
  .regex(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/, '價格需為非負十進位字串，最多 10 位整數、2 位小數。');
export const positiveQuantitySchema = quantitySchema.pipe(
  z.string().refine((value) => new Prisma.Decimal(value).greaterThan(0), '配方用量必須大於 0。'),
);
export const unitSchema = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[\p{L}\p{N}]+$/u, '單位需為不含空白的名稱，例如 g、kg、ml、L、個。');
const name = z.string().trim().min(1).max(100);
const ingredientFields = {
  sku: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/)
    .transform((value) => value.toUpperCase()),
  name,
  unit: unitSchema,
  safetyStock: quantitySchema,
  isActive: z.boolean(),
};
export const ingredientCreateSchema = z
  .object({
    ...ingredientFields,
    safetyStock: quantitySchema.default('0'),
    isActive: z.boolean().default(true),
  })
  .strict();
export const ingredientUpdateSchema = z
  .object(ingredientFields)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, '至少提供一個修改欄位。');
export const categoryCreateSchema = z
  .object({ name, isActive: z.boolean().default(true) })
  .strict();
export const categoryUpdateSchema = z
  .object({ name: name.optional(), isActive: z.boolean().optional() })
  .strict()
  .refine((value) => Object.keys(value).length > 0, '至少提供一個修改欄位。');
const imageUrl = z
  .url()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }, '圖片僅接受無帳密的 HTTP(S) URL。')
  .nullable();
const menuFields = {
  name,
  categoryId: z.uuid(),
  price: priceSchema,
  imageUrl,
  isActive: z.boolean(),
  isAvailable: z.boolean(),
};
export const menuCreateSchema = z
  .object({
    ...menuFields,
    imageUrl: imageUrl.default(null),
    isActive: z.boolean().default(true),
    isAvailable: z.boolean().default(true),
  })
  .strict();
export const menuUpdateSchema = z
  .object(menuFields)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, '至少提供一個修改欄位。');
const active = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();
const queryFields = {
  q: z.string().trim().max(100).default(''),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  isActive: active,
};
export const catalogQuerySchema = z.object(queryFields).strict();
export const ingredientQuerySchema = z
  .object({ ...queryFields, unit: unitSchema.optional(), lowStock: active })
  .strict();
export const menuQuerySchema = z
  .object({ ...queryFields, categoryId: z.uuid().optional(), isAvailable: active })
  .strict();
export const recipeReplaceSchema = z
  .object({
    expectedVersion: z.number().int().min(0).max(2147483646),
    items: z
      .array(
        z
          .object({ ingredientId: z.uuid(), quantity: positiveQuantitySchema, unit: unitSchema })
          .strict(),
      )
      .max(100),
  })
  .strict();
export function catalogValidate<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new ApiError(
      422,
      'VALIDATION_ERROR',
      `欄位格式不正確（${[...new Set(parsed.error.issues.map((issue) => issue.path.map(String).join('.') || 'request'))].join('、')}）；金額／數量請使用指定精度的十進位字串，不可直接寫入庫存。`,
    );
  return parsed.data;
}
export const availabilityQuerySchema = z
  .object({
    servings: z
      .string()
      .regex(/^[1-9]\d{0,4}$/)
      .default('1')
      .transform(Number)
      .pipe(z.number().int().min(1).max(10000)),
  })
  .strict();
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
export type IngredientQuery = z.infer<typeof ingredientQuerySchema>;
export type MenuQuery = z.infer<typeof menuQuerySchema>;
export type IngredientCreate = z.infer<typeof ingredientCreateSchema>;
export type IngredientUpdate = z.infer<typeof ingredientUpdateSchema>;
export type CategoryCreate = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;
export type MenuCreate = z.infer<typeof menuCreateSchema>;
export type MenuUpdate = z.infer<typeof menuUpdateSchema>;
export type RecipeReplace = z.infer<typeof recipeReplaceSchema>;
