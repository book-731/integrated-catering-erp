import { z } from 'zod';
import { getJson, sendJson } from './client';
const timestamps = { createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() };
export const ingredientSchema = z.object({
  id: z.uuid(),
  sku: z.string(),
  name: z.string(),
  unit: z.string(),
  stockQuantity: z.string().regex(/^\d+\.\d{3}$/),
  safetyStock: z.string().regex(/^\d+\.\d{3}$/),
  isActive: z.boolean(),
  isLowStock: z.boolean(),
  ...timestamps,
});
export const categorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  isActive: z.boolean(),
  menuItemCount: z.number().int().nonnegative(),
});
const categorySummary = z.object({ id: z.uuid(), name: z.string(), isActive: z.boolean() });
export const menuItemSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  categoryId: z.uuid(),
  category: categorySummary,
  price: z.string().regex(/^\d+\.\d{2}$/),
  imageUrl: z.string().nullable(),
  isActive: z.boolean(),
  isAvailable: z.boolean(),
  recipeVersion: z.number().int().nonnegative(),
  recipeCount: z.number().int().nonnegative(),
  ...timestamps,
});
export const recipeRowSchema = z.object({
  ingredientId: z.uuid(),
  sku: z.string(),
  name: z.string(),
  unit: z.string(),
  quantity: z.string().regex(/^\d+\.\d{3}$/),
  isActive: z.boolean(),
});
export const recipeSchema = z.object({
  menuItemId: z.uuid(),
  version: z.number().int().nonnegative(),
  items: z.array(recipeRowSchema),
});
const availabilitySchema = z.object({
  menuItemId: z.uuid(),
  recipeVersion: z.number().int(),
  servings: z.number().int(),
  canPrepare: z.boolean(),
  blockers: z.array(z.string()),
  checkedAt: z.iso.datetime(),
  reservation: z.literal(false),
  items: z.array(
    z.object({
      ingredientId: z.uuid(),
      sku: z.string(),
      name: z.string(),
      unit: z.string(),
      quantityPerServing: z.string(),
      requiredQuantity: z.string(),
      stockQuantity: z.string(),
      safetyStock: z.string(),
      isLowStock: z.boolean(),
      isActive: z.boolean(),
      sufficient: z.boolean(),
      shortageQuantity: z.string(),
    }),
  ),
});
export type IngredientAvailability = z.infer<typeof availabilitySchema>;
export type Ingredient = z.infer<typeof ingredientSchema>;
export type Category = z.infer<typeof categorySchema>;
export type MenuItem = z.infer<typeof menuItemSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
export type RecipeRow = z.infer<typeof recipeRowSchema>;
export interface CatalogQuery {
  q: string;
  isActive: string;
  page: number;
  pageSize?: number;
  unit?: string;
  categoryId?: string;
  isAvailable?: string;
  lowStock?: string;
}
export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface IngredientInput {
  sku: string;
  name: string;
  unit: string;
  safetyStock: string;
  isActive: boolean;
}
export interface CategoryInput {
  name: string;
  isActive: boolean;
}
export interface MenuInput {
  name: string;
  categoryId: string;
  price: string;
  imageUrl: string | null;
  isActive: boolean;
  isAvailable: boolean;
}
function envelope<T>(schema: z.ZodType<T>) {
  return z.object({ success: z.literal(true), data: schema, requestId: z.string() });
}
async function list<T>(
  path: string,
  schema: z.ZodType<T>,
  query: CatalogQuery,
  signal?: AbortSignal,
): Promise<Paged<T>> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...query, pageSize: query.pageSize ?? 20 })) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return (
    await getJson(
      `${path}?${params}`,
      envelope(
        z.object({
          items: z.array(schema),
          total: z.number().int().nonnegative(),
          page: z.number().int().positive(),
          pageSize: z.number().int().positive(),
        }),
      ),
      signal,
    )
  ).data;
}
export const getIngredients = (query: CatalogQuery, signal?: AbortSignal) =>
  list('/ingredients', ingredientSchema, query, signal);
export const getCategories = (query: CatalogQuery, signal?: AbortSignal) =>
  list('/menu-categories', categorySchema, query, signal);
export const getMenuItems = (query: CatalogQuery, signal?: AbortSignal) =>
  list('/menu-items', menuItemSchema, query, signal);
export const createIngredient = async (input: IngredientInput) =>
  (
    await sendJson(
      '/ingredients',
      'POST',
      input,
      envelope(z.object({ ingredient: ingredientSchema })),
    )
  ).data.ingredient;
export const updateIngredient = async (id: string, input: Partial<IngredientInput>) =>
  (
    await sendJson(
      `/ingredients/${id}`,
      'PATCH',
      input,
      envelope(z.object({ ingredient: ingredientSchema })),
    )
  ).data.ingredient;
export const createCategory = async (input: CategoryInput) =>
  (
    await sendJson(
      '/menu-categories',
      'POST',
      input,
      envelope(z.object({ category: categorySchema })),
    )
  ).data.category;
export const updateCategory = async (id: string, input: Partial<CategoryInput>) =>
  (
    await sendJson(
      `/menu-categories/${id}`,
      'PATCH',
      input,
      envelope(z.object({ category: categorySchema })),
    )
  ).data.category;
export const createMenuItem = async (input: MenuInput) =>
  (await sendJson('/menu-items', 'POST', input, envelope(z.object({ menuItem: menuItemSchema }))))
    .data.menuItem;
export const updateMenuItem = async (id: string, input: Partial<MenuInput>) =>
  (
    await sendJson(
      `/menu-items/${id}`,
      'PATCH',
      input,
      envelope(z.object({ menuItem: menuItemSchema })),
    )
  ).data.menuItem;
export const getRecipe = async (id: string, signal?: AbortSignal) =>
  (await getJson(`/menu-items/${id}/recipe`, envelope(z.object({ recipe: recipeSchema })), signal))
    .data.recipe;
export const replaceRecipe = async (id: string, expectedVersion: number, items: RecipeRow[]) =>
  (
    await sendJson(
      `/menu-items/${id}/recipe`,
      'PUT',
      {
        expectedVersion,
        items: items.map(({ ingredientId, quantity, unit }) => ({ ingredientId, quantity, unit })),
      },
      envelope(z.object({ recipe: recipeSchema })),
    )
  ).data.recipe;
export const getIngredientAvailability = async (
  id: string,
  servings: string,
  signal?: AbortSignal,
) =>
  (
    await getJson(
      `/menu-items/${id}/ingredient-availability?${new URLSearchParams({ servings })}`,
      envelope(z.object({ availability: availabilitySchema })),
      signal,
    )
  ).data.availability;
