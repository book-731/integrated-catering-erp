import { dateWindow } from './reports.service.js';
import { prisma } from '../../lib/prisma.js';
import type { Actor } from '../auth/auth.types.js';
import {
  write,
  sales,
  management,
  requireItem,
  unique,
  fail,
  decimal,
  move,
  json,
  type Tx,
} from './repository.js';
import type { Input, Query } from './validation.js';
import { Prisma } from '../../generated/prisma/client.js';
type RecipeSnapshot = {
  ingredientId: string;
  sku: string;
  name: string;
  unit: string;
  quantity: string;
  perServingQuantity: string;
};
export async function snapshot(tx: Tx, menuItemId: string, count: number) {
  const item = requireItem(
    await tx.menuItem.findUnique({
      where: { id: menuItemId },
      include: { category: true, recipes: { include: { ingredient: true } }, bundleParts: true },
    }),
  );
  if (!item.isActive || !item.isAvailable || !item.category.isActive)
    fail('MENU_UNAVAILABLE', '餐點或分類未供應。');
  const recipes: RecipeSnapshot[] = [];
  for (const row of item.recipes) {
    if (!row.ingredient.isActive) fail('INGREDIENT_INACTIVE', '配方含停用食材。');
    recipes.push({
      ingredientId: row.ingredientId,
      sku: row.ingredient.sku,
      name: row.ingredient.name,
      unit: row.ingredient.unit,
      quantity: row.quantity.times(count).toFixed(3),
      perServingQuantity: row.quantity.toFixed(3),
    });
  }
  return { item, recipes };
}
export function createOrder(actor: Actor, input: Input<'order'>) {
  return write(actor, sales, 'order', input, async (tx) => {
    let subtotal = decimal(0);
    const lines = [];
    for (const requested of input.lines) {
      const { item, recipes } = await snapshot(tx, requested.menuItemId, requested.quantity);
      const components = [];
      for (const part of item.bundleParts) {
        const child = await snapshot(tx, part.childId, part.quantity * requested.quantity);
        if (!child.recipes.length) fail('EMPTY_RECIPE', '套餐組件尚未設定配方。');
        if (child.item.bundleParts.length) fail('NESTED_BUNDLE', '不允許巢狀套餐。');
        recipes.push(...child.recipes);
        components.push({
          menuItemId: part.childId,
          name: child.item.name,
          quantity: part.quantity,
          recipeVersion: child.item.recipeVersion,
        });
      }
      unique(requested.optionIds);
      const groups = await tx.optionGroup.findMany({
        where: { menuItemId: item.id, isActive: true },
        include: {
          options: {
            where: { isActive: true },
            include: { recipes: { include: { ingredient: true } } },
          },
        },
      });
      const allowed = groups.flatMap((g) => g.options);
      if (requested.optionIds.some((id) => !allowed.some((v) => v.id === id)))
        fail('INVALID_OPTION', '選項不屬於餐點或已停用。', 422);
      let unitPrice = item.price;
      const options = [];
      for (const group of groups) {
        const selected = group.options.filter((o) => requested.optionIds.includes(o.id));
        if (selected.length < group.minSelect || selected.length > group.maxSelect)
          fail('OPTION_SELECTION', '選項數量不符合群組限制。', 422);
        for (const option of selected) {
          unitPrice = unitPrice.plus(option.price);
          options.push({
            id: option.id,
            name: option.name,
            price: option.price.toFixed(2),
            group: group.name,
          });
          for (const r of option.recipes) {
            if (!r.ingredient.isActive) fail('INGREDIENT_INACTIVE', '選項含停用食材。');
            recipes.push({
              ingredientId: r.ingredientId,
              sku: r.ingredient.sku,
              name: r.ingredient.name,
              unit: r.ingredient.unit,
              quantity: r.quantity.times(requested.quantity).toFixed(3),
              perServingQuantity: r.quantity.toFixed(3),
            });
          }
        }
      }
      if (!recipes.length) fail('EMPTY_RECIPE', '餐點須建立配方或有配方的套餐組件。');
      const total = unitPrice.times(requested.quantity);
      subtotal = subtotal.plus(total);
      lines.push({
        menuItemId: item.id,
        name: item.name,
        quantity: requested.quantity,
        unitPrice,
        total,
        snapshot: json({
          categoryId: item.categoryId,
          categoryName: item.category.name,
          recipeVersion: item.recipeVersion,
          basePrice: item.price.toFixed(2),
          components,
          options,
          recipes,
        }),
      });
    }
    if (decimal(input.discount).gt(subtotal)) fail('INVALID_DISCOUNT', '折扣不可超過小計。', 422);
    const total = subtotal.minus(input.discount).plus(input.serviceFee);
    if (total.gt('9999999999.99')) fail('AMOUNT_OVERFLOW', '金額超出範圍。', 422);
    return tx.order.create({
      data: {
        type: input.type,
        reference: input.reference,
        createdBy: actor.id,
        subtotal,
        discount: decimal(input.discount),
        serviceFee: decimal(input.serviceFee),
        total,
        lines: { create: lines },
      },
      include: { lines: true },
    });
  });
}
export function transition(actor: Actor, id: string, input: Input<'transition'>) {
  return write(
    actor,
    ['ADMIN', 'MANAGER', 'CASHIER', 'KITCHEN'],
    `order:${id}:status`,
    input,
    async (tx) => {
      const user = requireItem(await tx.user.findUnique({ where: { id: actor.id } }));
      if (user.role === 'KITCHEN' && input.status === 'CANCELLED')
        fail('FORBIDDEN', '廚房不可取消訂單。', 403);
      const order = requireItem(
        await tx.order.findUnique({ where: { id }, include: { lines: true } }),
      );
      if (order.revision !== input.expectedRevision)
        fail('REVISION_CONFLICT', '訂單已變更，請重新載入。');
      const valid =
        (order.status === 'PENDING' && ['PREPARING', 'CANCELLED'].includes(input.status)) ||
        (order.status === 'PREPARING' && ['COMPLETED', 'CANCELLED'].includes(input.status));
      if (!valid) fail('INVALID_TRANSITION', '不允許此狀態轉換。');
      if (input.status === 'CANCELLED' && order.paidAt)
        fail('PAID_ORDER', '已付款訂單不能直接取消；本版不處理退款。');
      if (input.status === 'PREPARING') {
        const needs = new Map<string, Prisma.Decimal>();
        for (const line of order.lines) {
          const snap = line.snapshot as { recipes: RecipeSnapshot[] };
          for (const r of snap.recipes) {
            const ingredient = requireItem(
              await tx.ingredient.findUnique({ where: { id: r.ingredientId } }),
            );
            if (ingredient.unit !== r.unit) fail('UNIT_MISMATCH', '快照與食材單位不符。');
            needs.set(r.ingredientId, (needs.get(r.ingredientId) ?? decimal(0)).plus(r.quantity));
          }
        }
        for (const [ingredientId, amount] of [...needs].sort(([a], [b]) => a.localeCompare(b)))
          await move(
            tx,
            actor.id,
            ingredientId,
            amount.negated(),
            'SALE',
            '訂單開始製作',
            `order:${id}:sale`,
          );
      }
      if (input.status === 'COMPLETED' && !order.paidAt)
        fail('PAYMENT_REQUIRED', '完成前須記錄全額付款。');
      return tx.order.update({
        where: { id },
        data: {
          status: input.status,
          revision: { increment: 1 },
          ...(input.status === 'COMPLETED' ? { completedAt: new Date() } : {}),
        },
        include: { lines: true },
      });
    },
  );
}
export function pay(actor: Actor, id: string, input: Input<'payment'>) {
  return write(actor, sales, `order:${id}:payment`, input, async (tx) => {
    const order = requireItem(await tx.order.findUnique({ where: { id } }));
    if (order.paidAt || order.status === 'CANCELLED') fail('PAYMENT_CONFLICT', '已付款或已取消。');
    return tx.order.update({
      where: { id },
      data: { paymentMethod: input.method, paidAt: new Date(), revision: { increment: 1 } },
    });
  });
}
export async function orders(q: Query) {
  const where = {
    ...(q.from || q.to ? { createdAt: { gte: dateWindow(q).start, lt: dateWindow(q).end } } : {}),
    ...(q.q ? { reference: { contains: q.q, mode: 'insensitive' as const } } : {}),
    ...(q.status ? { status: q.status } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      include: { lines: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.order.count({ where }),
  ]);
  return { items, total, page: q.page, pageSize: q.pageSize };
}
