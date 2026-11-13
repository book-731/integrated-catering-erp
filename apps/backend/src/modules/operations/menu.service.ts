import type { Actor } from '../auth/auth.types.js';
import { prisma } from '../../lib/prisma.js';
import { write, management, unique, requireItem, fail, decimal, type Tx } from './repository.js';
import type { Input } from './validation.js';
export const configuration = (id: string) =>
  prisma.menuItem.findUnique({
    where: { id },
    include: {
      bundleParts: { include: { child: true } },
      optionGroups: {
        include: { options: { include: { recipes: { include: { ingredient: true } } } } },
      },
    },
  });
export function setBundle(actor: Actor, id: string, input: Input<'bundle'>) {
  return write(actor, management, `bundle:${id}`, input, async (tx) => {
    requireItem(await tx.menuItem.findUnique({ where: { id } }));
    unique(input.parts.map((v) => v.childId));
    if (input.parts.length && (await tx.bundlePart.count({ where: { childId: id } })))
      fail('NESTED_BUNDLE', '套餐不能成為其他套餐的組件。');
    for (const part of input.parts) {
      const child = requireItem(
        await tx.menuItem.findUnique({
          where: { id: part.childId },
          include: { bundleParts: true, category: true },
        }),
      );
      if (
        part.childId === id ||
        child.bundleParts.length ||
        !child.isActive ||
        !child.category.isActive
      )
        fail('INVALID_BUNDLE', '套餐組件須是啟用的一般餐點，不允許巢狀套餐。');
    }
    await tx.bundlePart.deleteMany({ where: { parentId: id } });
    await tx.bundlePart.createMany({ data: input.parts.map((v) => ({ ...v, parentId: id })) });
    return { parts: input.parts };
  });
}
export function saveGroup(actor: Actor, id: string | undefined, input: Input<'group'>) {
  return write(actor, management, `group:${id ?? 'new'}`, input, async (tx) => {
    requireItem(await tx.menuItem.findUnique({ where: { id: input.menuItemId } }));
    const { requestKey: _, ...data } = input;
    if (id) {
      const old = requireItem(await tx.optionGroup.findUnique({ where: { id } }));
      if (old.menuItemId !== input.menuItemId) fail('IMMUTABLE_PARENT', '不可移轉群組。');
      return tx.optionGroup.update({ where: { id }, data });
    }
    return tx.optionGroup.create({ data });
  });
}
export async function validateRecipes(
  tx: Tx,
  rows: Input<'option'>['recipes'],
  previous = new Map<string, string>(),
) {
  unique(rows.map((v) => v.ingredientId));
  for (const row of rows) {
    const i = requireItem(await tx.ingredient.findUnique({ where: { id: row.ingredientId } }));
    if (
      (!i.isActive &&
        (!previous.has(i.id) || !decimal(previous.get(i.id)!).equals(row.quantity))) ||
      i.unit !== row.unit
    )
      fail('UNIT_MISMATCH', '食材須啟用且基礎單位一致。', 422);
  }
}
export function saveOption(actor: Actor, id: string | undefined, input: Input<'option'>) {
  return write(actor, management, `option:${id ?? 'new'}`, input, async (tx) => {
    const group = requireItem(await tx.optionGroup.findUnique({ where: { id: input.groupId } }));
    if (!group.isActive && input.isActive) fail('INACTIVE_GROUP', '群組已停用。');
    const previous = id
      ? requireItem(await tx.menuOption.findUnique({ where: { id }, include: { recipes: true } }))
      : null;
    await validateRecipes(
      tx,
      input.recipes,
      !input.isActive && previous
        ? new Map(previous.recipes.map((r) => [r.ingredientId, r.quantity.toString()]))
        : new Map(),
    );
    if (id) {
      const old = requireItem(await tx.menuOption.findUnique({ where: { id } }));
      if (old.groupId !== input.groupId) fail('IMMUTABLE_PARENT', '不可移轉選項。');
    }
    const data = {
      groupId: input.groupId,
      name: input.name,
      price: decimal(input.price),
      isActive: input.isActive,
    };
    const option = id
      ? await tx.menuOption.update({ where: { id }, data })
      : await tx.menuOption.create({ data });
    await tx.optionRecipe.deleteMany({ where: { optionId: option.id } });
    await tx.optionRecipe.createMany({
      data: input.recipes.map((r) => ({
        optionId: option.id,
        ingredientId: r.ingredientId,
        quantity: decimal(r.quantity),
      })),
    });
    return option;
  });
}
