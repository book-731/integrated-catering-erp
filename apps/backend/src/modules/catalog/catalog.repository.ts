import { prisma } from '../../lib/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import { ApiError } from '../../common/api-error.js';
import type { Actor } from '../auth/auth.types.js';
import type {
  CatalogQuery,
  IngredientQuery,
  MenuQuery,
  IngredientCreate,
  IngredientUpdate,
  CategoryCreate,
  CategoryUpdate,
  MenuCreate,
  MenuUpdate,
  RecipeReplace,
} from './catalog.validation.js';

const missing = (entity: string) => new ApiError(404, 'RESOURCE_NOT_FOUND', `找不到${entity}。`);
const pagination = (query: CatalogQuery) => ({
  skip: (query.page - 1) * query.pageSize,
  take: query.pageSize,
});
const categoryInclude = { _count: { select: { menuItems: true } } } as const;
const menuInclude = { category: true, _count: { select: { recipes: true } } } as const;
export class CatalogRepository {
  private async write<T>(
    actor: Actor,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    conflictCode = 'RESOURCE_CONFLICT',
  ): Promise<T> {
    try {
      return await prisma.$transaction(async (tx) => {
        // Small single-store catalog: serialize aggregate edits; no external I/O in transaction.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(12002002)::text`;
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${actor.id}::uuid FOR SHARE`;
        const user = await tx.user.findUnique({ where: { id: actor.id } });
        if (!user?.isActive || user.authVersion !== actor.authVersion)
          throw new ApiError(401, 'UNAUTHENTICATED', '登入已失效，請重新登入。');
        if (!['ADMIN', 'MANAGER'].includes(user.role))
          throw new ApiError(403, 'FORBIDDEN', '你沒有修改食材或菜單的權限。');
        return work(tx);
      });
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        if (error.code === 'P2002')
          throw new ApiError(409, conflictCode, 'SKU 或分類名稱已被使用（忽略大小寫及前後空白）。');
        if (error.code === 'P2003')
          throw new ApiError(409, 'RESOURCE_IN_USE', '資料仍被使用，無法破壞關聯。');
      }
      throw error;
    }
  }
  async listIngredients(query: IngredientQuery) {
    const where: Prisma.IngredientWhereInput = {
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.unit ? { unit: query.unit } : {}),
      ...(query.lowStock === undefined
        ? {}
        : {
            stockQuantity: query.lowStock
              ? { lte: prisma.ingredient.fields.safetyStock }
              : { gt: prisma.ingredient.fields.safetyStock },
          }),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { sku: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.ingredient.findMany({
        where,
        ...pagination(query),
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      prisma.ingredient.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
  async ingredient(id: string) {
    const item = await prisma.ingredient.findUnique({ where: { id } });
    if (!item) throw missing('食材');
    return item;
  }
  createIngredient(actor: Actor, input: IngredientCreate) {
    return this.write(
      actor,
      (tx) =>
        tx.ingredient.create({
          data: { ...input, safetyStock: new Prisma.Decimal(input.safetyStock) },
        }),
      'SKU_CONFLICT',
    );
  }
  updateIngredient(actor: Actor, id: string, input: IngredientUpdate) {
    return this.write(
      actor,
      async (tx) => {
        const current = await tx.ingredient.findUnique({
          where: { id },
          include: { _count: { select: { recipes: true } } },
        });
        if (!current) throw missing('食材');
        if (
          input.unit !== undefined &&
          input.unit !== current.unit &&
          (!current.stockQuantity.isZero() ||
            current._count.recipes > 0 ||
            (await tx.stockMovement.count({ where: { ingredientId: id } })) > 0 ||
            (await tx.optionRecipe.count({ where: { ingredientId: id } })) > 0 ||
            (await tx.purchaseLine.count({ where: { ingredientId: id } })) > 0 ||
            (
              await tx.$queryRaw<
                { id: string }[]
              >`SELECT id FROM order_lines WHERE snapshot @> ${JSON.stringify({ recipes: [{ ingredientId: id }] })}::jsonb LIMIT 1`
            ).length > 0)
        )
          throw new ApiError(
            409,
            'UNIT_LOCKED',
            '食材已有配方或非零庫存，不可變更基礎單位；本階段不做單位換算。',
          );
        const data: Prisma.IngredientUpdateInput = {};
        if (input.sku !== undefined) data.sku = input.sku;
        if (input.name !== undefined) data.name = input.name;
        if (input.unit !== undefined) data.unit = input.unit;
        if (input.isActive !== undefined) data.isActive = input.isActive;
        if (input.safetyStock !== undefined)
          data.safetyStock = new Prisma.Decimal(input.safetyStock);
        return tx.ingredient.update({ where: { id }, data });
      },
      'SKU_CONFLICT',
    );
  }
  async listCategories(query: CatalogQuery) {
    const where: Prisma.MenuCategoryWhereInput = {
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.menuCategory.findMany({
        where,
        ...pagination(query),
        include: categoryInclude,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      prisma.menuCategory.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
  async category(id: string) {
    const item = await prisma.menuCategory.findUnique({ where: { id }, include: categoryInclude });
    if (!item) throw missing('分類');
    return item;
  }
  createCategory(actor: Actor, input: CategoryCreate) {
    return this.write(
      actor,
      (tx) => tx.menuCategory.create({ data: input, include: categoryInclude }),
      'CATEGORY_NAME_CONFLICT',
    );
  }
  updateCategory(actor: Actor, id: string, input: CategoryUpdate) {
    return this.write(
      actor,
      async (tx) => {
        if (!(await tx.menuCategory.findUnique({ where: { id } }))) throw missing('分類');
        const data: Prisma.MenuCategoryUpdateInput = {};
        if (input.name !== undefined) data.name = input.name;
        if (input.isActive !== undefined) data.isActive = input.isActive;
        return tx.menuCategory.update({ where: { id }, data, include: categoryInclude });
      },
      'CATEGORY_NAME_CONFLICT',
    );
  }
  async listMenu(query: MenuQuery) {
    const where: Prisma.MenuItemWhereInput = {
      ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.isAvailable === undefined ? {} : { isAvailable: query.isAvailable }),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.menuItem.findMany({
        where,
        ...pagination(query),
        include: menuInclude,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      prisma.menuItem.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
  async menuItem(id: string) {
    const item = await prisma.menuItem.findUnique({ where: { id }, include: menuInclude });
    if (!item) throw missing('餐點');
    return item;
  }
  createMenu(actor: Actor, input: MenuCreate) {
    return this.write(actor, async (tx) => {
      const category = await tx.menuCategory.findUnique({ where: { id: input.categoryId } });
      if (!category) throw missing('分類');
      if (!category.isActive) throw new ApiError(409, 'CATEGORY_INACTIVE', '請選擇啟用中的分類。');
      return tx.menuItem.create({
        data: { ...input, price: new Prisma.Decimal(input.price) },
        include: menuInclude,
      });
    });
  }
  updateMenu(actor: Actor, id: string, input: MenuUpdate) {
    return this.write(actor, async (tx) => {
      const current = await tx.menuItem.findUnique({ where: { id } });
      if (!current) throw missing('餐點');
      const category = await tx.menuCategory.findUnique({
        where: { id: input.categoryId ?? current.categoryId },
      });
      if (!category) throw missing('分類');
      if (
        !category.isActive &&
        ((input.categoryId !== undefined && input.categoryId !== current.categoryId) ||
          (!current.isActive && input.isActive === true))
      )
        throw new ApiError(409, 'CATEGORY_INACTIVE', '變更分類或啟用餐點時，分類必須啟用。');
      const data: Prisma.MenuItemUncheckedUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.categoryId !== undefined) data.categoryId = input.categoryId;
      if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl;
      if (input.price !== undefined) data.price = new Prisma.Decimal(input.price);
      if (input.isActive !== undefined) data.isActive = input.isActive;
      if (input.isAvailable !== undefined) data.isAvailable = input.isAvailable;
      return tx.menuItem.update({ where: { id }, data, include: menuInclude });
    });
  }
  async recipe(id: string) {
    const item = await prisma.$transaction(
      (tx) =>
        tx.menuItem.findUnique({
          where: { id },
          include: { recipes: { include: { ingredient: true }, orderBy: { ingredientId: 'asc' } } },
        }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    if (!item) throw missing('餐點');
    return item;
  }
  async availability(id: string) {
    const item = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        return tx.menuItem.findUnique({
          where: { id },
          include: {
            category: true,
            bundleParts: {
              include: {
                child: { include: { category: true, recipes: { include: { ingredient: true } } } },
              },
            },
            recipes: { include: { ingredient: true }, orderBy: { ingredientId: 'asc' } },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    if (!item) throw missing('餐點');
    return item;
  }
  replaceRecipe(actor: Actor, id: string, input: RecipeReplace) {
    return this.write(actor, async (tx) => {
      const current = await tx.menuItem.findUnique({ where: { id }, include: { recipes: true } });
      if (!current) throw missing('餐點');
      if (!current.isActive)
        throw new ApiError(
          409,
          'MENU_ITEM_INACTIVE',
          '停用餐點的配方保留供查詢，請先啟用餐點再編輯。',
        );
      if (current.recipeVersion !== input.expectedVersion)
        throw new ApiError(
          409,
          'RECIPE_VERSION_CONFLICT',
          '配方已由其他人修改，請重新載入後再編輯。',
        );
      const ids = input.items.map((row) => row.ingredientId);
      if (new Set(ids).size !== ids.length)
        throw new ApiError(409, 'RECIPE_DUPLICATE', '同一餐點不可重複加入相同食材。');
      const ingredients = await tx.ingredient.findMany({ where: { id: { in: ids } } });
      const byId = new Map(ingredients.map((row) => [row.id, row]));
      for (const row of input.items) {
        const ingredient = byId.get(row.ingredientId);
        if (!ingredient) throw missing('配方食材');
        if (row.unit !== ingredient.unit)
          throw new ApiError(
            422,
            'UNIT_MISMATCH',
            '配方單位必須與食材基礎單位完全相同，不提供自動換算。',
          );
        const previous = current.recipes.find((value) => value.ingredientId === row.ingredientId);
        if (!ingredient.isActive && (!previous || !previous.quantity.equals(row.quantity)))
          throw new ApiError(
            409,
            'INGREDIENT_INACTIVE',
            '停用食材只能保留既有用量或移除，不可新增或修改用量。',
          );
      }
      await tx.recipeIngredient.deleteMany({ where: { menuItemId: id } });
      if (input.items.length)
        await tx.recipeIngredient.createMany({
          data: input.items.map((row) => ({
            menuItemId: id,
            ingredientId: row.ingredientId,
            quantity: new Prisma.Decimal(row.quantity),
          })),
        });
      await tx.menuItem.update({ where: { id }, data: { recipeVersion: { increment: 1 } } });
      return tx.menuItem.findUniqueOrThrow({
        where: { id },
        include: { recipes: { include: { ingredient: true }, orderBy: { ingredientId: 'asc' } } },
      });
    });
  }
}
export const catalogRepository = new CatalogRepository();
