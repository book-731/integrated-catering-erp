import { dateWindow } from './reports.service.js';
import { prisma } from '../../lib/prisma.js';
import type { Actor } from '../auth/auth.types.js';
import { write, management, requireItem, unique, fail, decimal, move, json } from './repository.js';
import type { Input, Query } from './validation.js';
export function supplier(actor: Actor, id: string | undefined, input: Input<'supplier'>) {
  return write(actor, management, `supplier:${id ?? 'new'}`, input, (tx) => {
    const { requestKey: _, ...data } = input;
    return id ? tx.supplier.update({ where: { id }, data }) : tx.supplier.create({ data });
  });
}
export function purchase(actor: Actor, input: Input<'purchase'>) {
  return write(actor, management, 'purchase', input, async (tx) => {
    const supplier = requireItem(await tx.supplier.findUnique({ where: { id: input.supplierId } }));
    if (!supplier.isActive) fail('SUPPLIER_INACTIVE', '供應商已停用。');
    unique(input.lines.map((l) => l.ingredientId));
    for (const line of input.lines) {
      const i = requireItem(await tx.ingredient.findUnique({ where: { id: line.ingredientId } }));
      if (!i.isActive || i.unit !== line.unit)
        fail('UNIT_MISMATCH', '請使用啟用食材的基礎單位。', 422);
    }
    return tx.purchase.create({
      data: {
        supplierId: input.supplierId,
        note: input.note,
        createdBy: actor.id,
        lines: {
          create: input.lines.map((l) => ({
            ...l,
            quantity: decimal(l.quantity),
            unitCost: decimal(l.unitCost),
          })),
        },
      },
      include: { lines: true, supplier: true, receipts: true },
    });
  });
}
export function purchaseStatus(actor: Actor, id: string, input: Input<'purchaseStatus'>) {
  return write(actor, management, `purchase:${id}:status`, input, async (tx) => {
    const p = requireItem(
      await tx.purchase.findUnique({ where: { id }, include: { receipts: true } }),
    );
    const allowed: Record<string, string[]> = {
      REQUESTED: ['APPROVED', 'CANCELLED'],
      APPROVED: ['ORDERED', 'CANCELLED'],
      ORDERED: p.receipts.length ? [] : ['CANCELLED'],
    };
    if (!allowed[p.status]?.includes(input.status))
      fail('INVALID_TRANSITION', '採購狀態不允許此操作。');
    return tx.purchase.update({ where: { id }, data: { status: input.status } });
  });
}
export function receive(actor: Actor, id: string, input: Input<'receipt'>) {
  return write(actor, management, `purchase:${id}:receipt`, input, async (tx) => {
    const p = requireItem(
      await tx.purchase.findUnique({ where: { id }, include: { lines: true } }),
    );
    if (!['ORDERED', 'PARTIAL'].includes(p.status))
      fail('INVALID_TRANSITION', '採購單尚未訂購或已結案。');
    unique(input.lines.map((l) => l.lineId));
    const receipt = await tx.goodsReceipt.create({
      data: { purchaseId: id, actorId: actor.id, lines: json(input.lines) },
    });
    for (const received of input.lines) {
      const line = p.lines.find((l) => l.id === received.lineId);
      if (!line) fail('INVALID_LINE', '收貨項目不屬於採購單。', 422);
      if (line.received.plus(received.quantity).gt(line.quantity))
        fail('OVER_RECEIPT', '收貨超過未收數量。');
      const i = requireItem(await tx.ingredient.findUnique({ where: { id: line.ingredientId } }));
      if (i.unit !== line.unit) fail('UNIT_MISMATCH', '食材單位已異動。');
      await move(
        tx,
        actor.id,
        line.ingredientId,
        decimal(received.quantity),
        'RECEIPT',
        '採購收貨',
        `receipt:${receipt.id}`,
      );
      await tx.purchaseLine.update({
        where: { id: line.id },
        data: { received: { increment: decimal(received.quantity) } },
      });
    }
    const lines = await tx.purchaseLine.findMany({ where: { purchaseId: id } });
    await tx.purchase.update({
      where: { id },
      data: { status: lines.every((l) => l.received.equals(l.quantity)) ? 'RECEIVED' : 'PARTIAL' },
    });
    return receipt;
  });
}
export async function purchases(q: Query) {
  const where = {
    ...(q.from || q.to ? { createdAt: { gte: dateWindow(q).start, lt: dateWindow(q).end } } : {}),
    ...(q.q
      ? {
          OR: [
            { note: { contains: q.q, mode: 'insensitive' as const } },
            { supplier: { name: { contains: q.q, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
    ...(q.status ? { status: q.status } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.purchase.findMany({
      where,
      include: {
        supplier: true,
        lines: { include: { ingredient: { select: { name: true } } } },
        receipts: true,
      },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    }),
    prisma.purchase.count({ where }),
  ]);
  return { items, total, page: q.page, pageSize: q.pageSize };
}
