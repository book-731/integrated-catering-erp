import { z } from 'zod';
import { ApiError } from '../../common/api-error.js';
import { roles } from './auth.types.js';
export const emailSchema = z
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
export const newPasswordSchema = z
  .string()
  .min(12, '密碼至少需要 12 個字元。')
  .max(128, '密碼不可超過 128 個字元。');
export const loginSchema = z
  .object({ email: emailSchema, password: z.string().min(1).max(128) })
  .strict();
export const createUserSchema = z
  .object({
    email: emailSchema,
    displayName: z.string().trim().min(1).max(100),
    password: newPasswordSchema,
    role: z.enum(roles),
    isActive: z.boolean().default(true),
  })
  .strict();
export const updateUserSchema = z
  .object({
    email: emailSchema.optional(),
    displayName: z.string().trim().min(1).max(100).optional(),
    password: newPasswordSchema.optional(),
    role: z.enum(roles).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, '至少提供一個修改欄位。');
export const userQuerySchema = z
  .object({
    q: z.string().trim().max(100).default(''),
    role: z.enum(roles).optional(),
    isActive: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success)
    throw new ApiError(422, 'VALIDATION_ERROR', '輸入資料不正確，請檢查欄位與密碼長度。');
  return result.data;
}
