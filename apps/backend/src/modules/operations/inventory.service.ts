import { dateWindow } from './reports.service.js';
import { prisma } from '../../lib/prisma.js';
import type { Actor } from '../auth/auth.types.js';
import { write, management, move, requireItem, decimal, fail } from './repository.js';
import type { Input, Query } from './validation.js';
export function stockCommand(actor: Actor, input: Input<'stock'>) {
  return write(actor, management, 'stock', input, async (tx) => {
    const item = requireItem(await tx.ingredient.findUnique({ where: { id: input.ingredientId } }));
    if (!item.isActive) fail('INGREDIENT_INACTIVE', '食材已停用。');
    if (
      input.type === 'OPENING' &&
      (await tx.stockMovement.count({ where: { ingredientId: item.id } }))
    )
      fail('OPENING_EXISTS', '已有庫存流水，不可再次設定期初。');
    let delta = decimal(input.quantity);
    if (['OPENING', 'COUNT'].includes(input.type)) delta = delta.minus(item.stockQuantity);
    else if (['ISSUE', 'WASTE'].includes(input.type)) delta = delta.negated();
    if (delta.isZero() && !['OPENING', 'COUNT'].includes(input.type))
      fail('ZERO_MOVEMENT', '異動數量須大於零。', 422);
    return move(
      tx,
      actor.id,
      item.id,
      delta,
      input.type,
      input.reason,
      `stock:${actor.id}:${input.requestKey}`,
    );
  });
}
export async function movements(q: Query) {
  const where = {
    ...(q.from || q.to ? { createdAt: { gte: dateWindow(q).start, lt: dateWindow(q).end } } : {}),
    ...(q.q
      ? {
          ingredient: {
            OR: [
              { name: { contains: q.q, mode: 'insensitive' as const } },
              { sku: { contains: q.q, mode: 'insensitive' as const } },
            ],
          },
        }
      : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.stockMovement.findMany({
      where,
      include: { ingredient: { select: { name: true, sku: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.stockMovement.count({ where }),
  ]);
  return { items, total, page: q.page, pageSize: q.pageSize };
}
