import { createHash } from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import { ApiError } from '../../common/api-error.js';
import type { Actor, Role } from '../auth/auth.types.js';
export const management: Role[] = ['ADMIN', 'MANAGER'];
export const sales: Role[] = ['ADMIN', 'MANAGER', 'CASHIER'];
export type Tx = Prisma.TransactionClient;
export const decimal = (value: string | number | Prisma.Decimal) => new Prisma.Decimal(value);
export function fail(code: string, message: string, status = 409): never {
  throw new ApiError(status, code, message);
}
export function json(value: unknown): Prisma.InputJsonValue {
  function encode(v: unknown, key = ''): unknown {
    if (v instanceof Prisma.Decimal)
      return v.toFixed(
        ['quantity', 'before', 'after', 'received', 'stockQuantity', 'safetyStock'].includes(key)
          ? 3
          : 2,
      );
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map((x) => encode(x, key));
    if (v && typeof v === 'object')
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x, k)]));
    return v;
  }
  return JSON.parse(JSON.stringify(encode(value))) as Prisma.InputJsonValue;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export async function write(
  actor: Actor,
  roles: Role[],
  scope: string,
  input: { requestKey: string },
  work: (tx: Tx) => Promise<unknown>,
) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        // Single Windows demo store. All operational commands and catalog edits share this lock.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(12002002)::text`;
        await tx.$queryRaw`SELECT id FROM users WHERE id=${actor.id}::uuid FOR SHARE`;
        const user = await tx.user.findUnique({ where: { id: actor.id } });
        if (!user?.isActive || user.authVersion !== actor.authVersion)
          fail('UNAUTHENTICATED', '登入已失效。', 401);
        if (!roles.includes(user.role)) fail('FORBIDDEN', '沒有操作權限。', 403);
        const receiptId = `${actor.id}:${input.requestKey}`,
          hash = createHash('sha256')
            .update(JSON.stringify(canonical({ scope, input })))
            .digest('hex');
        const old = await tx.commandReceipt.findUnique({ where: { id: receiptId } });
        if (old) {
          if (old.hash !== hash) fail('IDEMPOTENCY_CONFLICT', '同一請求識別碼不可用於不同內容。');
          return old.result;
        }
        const result = json(await work(tx));
        await tx.commandReceipt.create({ data: { id: receiptId, hash, result } });
        return result;
      },
      { maxWait: 10000, timeout: 20000 },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') fail('DUPLICATE', '識別碼或名稱重複。');
      if (error.code === 'P2025') fail('NOT_FOUND', '找不到資料。', 404);
      if (error.code === 'P2003') fail('RESOURCE_IN_USE', '關聯資料不存在或仍被使用。');
      if (['P2020', 'P2000'].includes(error.code))
        fail('VALUE_OVERFLOW', '數量或金額超出欄位範圍。', 422);
    }
    throw error;
  }
}
export async function move(
  tx: Tx,
  actorId: string,
  ingredientId: string,
  delta: Prisma.Decimal,
  type: string,
  reason: string,
  source: string,
) {
  const ingredient = await tx.ingredient.findUnique({ where: { id: ingredientId } });
  if (!ingredient) fail('NOT_FOUND', '找不到食材。', 404);
  if (!ingredient.isActive && delta.isNegative()) fail('INGREDIENT_INACTIVE', '食材已停用。');
  const after = ingredient.stockQuantity.plus(delta);
  if (after.isNegative()) fail('INSUFFICIENT_STOCK', `${ingredient.name} 庫存不足。`);
  if (after.greaterThan('99999999999.999')) fail('QUANTITY_OVERFLOW', '庫存超出精度上限。', 422);
  await tx.ingredient.update({ where: { id: ingredientId }, data: { stockQuantity: after } });
  return tx.stockMovement.create({
    data: {
      ingredientId,
      type,
      quantity: delta,
      before: ingredient.stockQuantity,
      after,
      unit: ingredient.unit,
      reason,
      source,
      actorId,
    },
  });
}
export function unique(ids: string[]) {
  if (new Set(ids).size !== ids.length) fail('DUPLICATE', '不得重複選擇同一筆資料。', 422);
}
export function requireItem<T>(value: T | null): T {
  if (!value) fail('NOT_FOUND', '找不到資料。', 404);
  return value;
}
