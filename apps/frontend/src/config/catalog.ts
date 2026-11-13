import { z } from 'zod';
import type { Role } from './roles';
export const canManageCatalog = (role: Role | undefined) => role === 'ADMIN' || role === 'MANAGER';
export const canReadIngredients = (role: Role | undefined) =>
  canManageCatalog(role) || role === 'KITCHEN';
export const canReadRecipe = (role: Role | undefined) =>
  canManageCatalog(role) || role === 'KITCHEN';
export const quantityInputSchema = z
  .string()
  .regex(/^(0|[1-9]\d{0,10})(\.\d{1,3})?$/, '需為非負十進位字串，最多 11 位整數、3 位小數。');
export const positiveQuantityInputSchema = quantityInputSchema.refine(
  (value) => /[1-9]/.test(value),
  '配方用量必須大於 0。',
);
export const priceInputSchema = z
  .string()
  .regex(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/, '價格需為非負數，最多 10 位整數、2 位小數。');
export const ingredientFormSchema = z.object({
  sku: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/, 'SKU 需為 1–64 位英數、點、底線或連字號。')
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1, '請輸入食材名稱。').max(100),
  unit: z
    .string()
    .trim()
    .min(1, '請輸入基礎單位。')
    .max(20)
    .regex(/^[\p{L}\p{N}]+$/u, '單位不可含空白或符號。'),
  safetyStock: quantityInputSchema,
  isActive: z.boolean(),
});
export const categoryFormSchema = z.object({
  name: z.string().trim().min(1, '請輸入分類名稱。').max(100),
  isActive: z.boolean(),
});
export const menuFormSchema = z.object({
  name: z.string().trim().min(1, '請輸入餐點名稱。').max(100),
  categoryId: z.uuid('請選擇分類。'),
  price: priceInputSchema,
  imageUrl: z
    .string()
    .trim()
    .max(2048)
    .refine((value) => {
      if (!value) return true;
      try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
      } catch {
        return false;
      }
    }, '圖片請使用無帳密的 HTTP(S) URL。'),
  isActive: z.boolean(),
  isAvailable: z.boolean(),
});
export const suggestedUnits = ['g', 'kg', 'ml', 'L', '個'];
export const fieldErrors = (error: z.ZodError) =>
  Object.fromEntries(error.issues.map((issue) => [String(issue.path[0]), issue.message]));
