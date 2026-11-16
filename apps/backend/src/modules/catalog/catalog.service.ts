import type { Actor } from '../auth/auth.types.js';
import type { Ingredient } from '../../generated/prisma/client.js';
import { catalogRepository, type CatalogRepository } from './catalog.repository.js';
import { MenuImageStorage } from './menu-image-storage.js';
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
type CategoryRecord = Awaited<ReturnType<CatalogRepository['category']>>;
type MenuRecord = Awaited<ReturnType<CatalogRepository['menuItem']>>;
type RecipeRecord = Awaited<ReturnType<CatalogRepository['recipe']>>;
export function ingredientDto(item: Ingredient) {
  return {
    id: item.id,
    sku: item.sku,
    name: item.name,
    unit: item.unit,
    isActive: item.isActive,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    stockQuantity: item.stockQuantity.toFixed(3),
    safetyStock: item.safetyStock.toFixed(3),
    isLowStock: item.stockQuantity.lessThanOrEqualTo(item.safetyStock),
  };
}
export function categoryDto(item: CategoryRecord) {
  return {
    id: item.id,
    name: item.name,
    isActive: item.isActive,
    menuItemCount: item._count.menuItems,
  };
}
export function menuDto(item: MenuRecord) {
  const { _count, price, category, ...fields } = item;
  return {
    ...fields,
    price: price.toFixed(2),
    category: { id: category.id, name: category.name, isActive: category.isActive },
    recipeCount: _count.recipes,
  };
}
export function recipeDto(item: RecipeRecord) {
  return {
    menuItemId: item.id,
    version: item.recipeVersion,
    items: item.recipes.map((row) => ({
      ingredientId: row.ingredientId,
      sku: row.ingredient.sku,
      name: row.ingredient.name,
      unit: row.ingredient.unit,
      quantity: row.quantity.toFixed(3),
      isActive: row.ingredient.isActive,
    })),
  };
}
export class CatalogService {
  constructor(
    private readonly repository = catalogRepository,
    private readonly imageStorage = new MenuImageStorage(),
  ) {}
  async ingredients(query: IngredientQuery) {
    const result = await this.repository.listIngredients(query);
    return { ...result, items: result.items.map(ingredientDto) };
  }
  async ingredient(id: string) {
    return ingredientDto(await this.repository.ingredient(id));
  }
  async createIngredient(actor: Actor, input: IngredientCreate) {
    return ingredientDto(await this.repository.createIngredient(actor, input));
  }
  async updateIngredient(actor: Actor, id: string, input: IngredientUpdate) {
    return ingredientDto(await this.repository.updateIngredient(actor, id, input));
  }
  async categories(query: CatalogQuery) {
    const result = await this.repository.listCategories(query);
    return { ...result, items: result.items.map(categoryDto) };
  }
  async category(id: string) {
    return categoryDto(await this.repository.category(id));
  }
  async createCategory(actor: Actor, input: CategoryCreate) {
    return categoryDto(await this.repository.createCategory(actor, input));
  }
  async updateCategory(actor: Actor, id: string, input: CategoryUpdate) {
    return categoryDto(await this.repository.updateCategory(actor, id, input));
  }
  async menu(query: MenuQuery) {
    const result = await this.repository.listMenu(query);
    return { ...result, items: result.items.map(menuDto) };
  }
  async menuItem(id: string) {
    return menuDto(await this.repository.menuItem(id));
  }
  async createMenu(actor: Actor, input: MenuCreate) {
    return menuDto(await this.repository.createMenu(actor, input));
  }
  async updateMenu(actor: Actor, id: string, input: MenuUpdate) {
    const raw = await this.repository.updateMenu(actor, id, input);
    const isWrapped = typeof raw === 'object' && raw !== null && 'item' in raw;
    const item = isWrapped
      ? (raw as { item: MenuRecord; previousImageUrl: string | null }).item
      : (raw as MenuRecord);
    const previousImageUrl = isWrapped
      ? (raw as { item: MenuRecord; previousImageUrl: string | null }).previousImageUrl
      : null;

    if (input.imageUrl !== undefined && previousImageUrl !== item.imageUrl) {
      await this.imageStorage.deleteByImageUrlQuietly(previousImageUrl);
    }
    return menuDto(item);
  }
  async uploadMenuImage(actor: Actor, id: string, contentType: string | undefined, buffer: Buffer) {
    await this.repository.menuItem(id);
    const saved = await this.imageStorage.save(contentType, buffer);
    let result: { item: MenuRecord; previousImageUrl: string | null };
    try {
      result = await this.repository.setMenuImage(actor, id, saved.imageUrl);
    } catch (error) {
      await this.imageStorage.deleteFilename(saved.filename);
      throw error;
    }
    if (result.previousImageUrl !== result.item.imageUrl) {
      await this.imageStorage.deleteByImageUrlQuietly(result.previousImageUrl);
    }
    return menuDto(result.item);
  }
  async deleteMenuImage(actor: Actor, id: string) {
    const result = await this.repository.setMenuImage(actor, id, null);
    if (result.previousImageUrl) {
      await this.imageStorage.deleteByImageUrlQuietly(result.previousImageUrl);
    }
    return menuDto(result.item);
  }
  async readMenuImage(filename: string) {
    return this.imageStorage.read(filename);
  }
  async recipe(id: string) {
    return recipeDto(await this.repository.recipe(id));
  }
  async availability(id: string, servings: number) {
    const item = await this.repository.availability(id),
      blockers: string[] = [];
    if (!item.isActive) blockers.push('餐點已停用');
    if (!item.category.isActive) blockers.push('分類已停用');
    if (!item.isAvailable) blockers.push('餐點暫停供應');
    const aggregated = new Map(item.recipes.map((r) => [r.ingredientId, { ...r }]));
    for (const part of item.bundleParts) {
      if (!part.child.isActive || !part.child.isAvailable || !part.child.category.isActive)
        blockers.push('套餐組件未供應');
      if (!part.child.recipes.length) blockers.push('套餐組件尚未設定配方');
      for (const recipe of part.child.recipes) {
        const previous = aggregated.get(recipe.ingredientId);
        const quantity = recipe.quantity.times(part.quantity);
        aggregated.set(recipe.ingredientId, {
          ...recipe,
          quantity: previous ? previous.quantity.plus(quantity) : quantity,
        });
      }
    }
    if (!aggregated.size) blockers.push('尚未設定配方');
    const items = [...aggregated.values()].map((row) => {
      const required = row.quantity.mul(String(servings)),
        stock = row.ingredient.stockQuantity;
      return {
        ingredientId: row.ingredientId,
        sku: row.ingredient.sku,
        name: row.ingredient.name,
        unit: row.ingredient.unit,
        quantityPerServing: row.quantity.toFixed(3),
        requiredQuantity: required.toFixed(3),
        stockQuantity: stock.toFixed(3),
        safetyStock: row.ingredient.safetyStock.toFixed(3),
        isLowStock: stock.lessThanOrEqualTo(row.ingredient.safetyStock),
        isActive: row.ingredient.isActive,
        sufficient: row.ingredient.isActive && stock.greaterThanOrEqualTo(required),
        shortageQuantity: stock.lessThan(required) ? required.minus(stock).toFixed(3) : '0.000',
      };
    });
    return {
      menuItemId: id,
      recipeVersion: item.recipeVersion,
      servings,
      canPrepare: !blockers.length && items.every((row) => row.sufficient),
      blockers,
      items,
      checkedAt: new Date().toISOString(),
      reservation: false as const,
    };
  }
  async replaceRecipe(actor: Actor, id: string, input: RecipeReplace) {
    return recipeDto(await this.repository.replaceRecipe(actor, id, input));
  }
}
