import type { Request, RequestHandler } from 'express';
import { z } from 'zod';
import { sendSuccess } from '../../common/http.js';
import { currentActor } from '../auth/auth.middleware.js';
import {
  catalogValidate,
  ingredientQuerySchema,
  catalogQuerySchema,
  menuQuerySchema,
  ingredientCreateSchema,
  ingredientUpdateSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  menuCreateSchema,
  menuUpdateSchema,
  recipeReplaceSchema,
  availabilityQuerySchema,
} from './catalog.validation.js';
import { CatalogService } from './catalog.service.js';
const id = (request: Request) => catalogValidate(z.uuid(), request.params.id);
export function catalogController(service = new CatalogService()) {
  const ingredients: RequestHandler = async (request, response) =>
    sendSuccess(
      request,
      response,
      await service.ingredients(catalogValidate(ingredientQuerySchema, request.query)),
    );
  const ingredient: RequestHandler = async (request, response) =>
    sendSuccess(request, response, { ingredient: await service.ingredient(id(request)) });
  const createIngredient: RequestHandler = async (request, response) => {
    const ingredient = await service.createIngredient(
      currentActor(request),
      catalogValidate(ingredientCreateSchema, request.body),
    );
    response.status(201);
    sendSuccess(request, response, { ingredient });
  };
  const updateIngredient: RequestHandler = async (request, response) =>
    sendSuccess(request, response, {
      ingredient: await service.updateIngredient(
        currentActor(request),
        id(request),
        catalogValidate(ingredientUpdateSchema, request.body),
      ),
    });
  const categories: RequestHandler = async (request, response) =>
    sendSuccess(
      request,
      response,
      await service.categories(catalogValidate(catalogQuerySchema, request.query)),
    );
  const category: RequestHandler = async (request, response) =>
    sendSuccess(request, response, { category: await service.category(id(request)) });
  const createCategory: RequestHandler = async (request, response) => {
    const category = await service.createCategory(
      currentActor(request),
      catalogValidate(categoryCreateSchema, request.body),
    );
    response.status(201);
    sendSuccess(request, response, { category });
  };
  const updateCategory: RequestHandler = async (request, response) =>
    sendSuccess(request, response, {
      category: await service.updateCategory(
        currentActor(request),
        id(request),
        catalogValidate(categoryUpdateSchema, request.body),
      ),
    });
  const menu: RequestHandler = async (request, response) =>
    sendSuccess(
      request,
      response,
      await service.menu(catalogValidate(menuQuerySchema, request.query)),
    );
  const menuItem: RequestHandler = async (request, response) =>
    sendSuccess(request, response, { menuItem: await service.menuItem(id(request)) });
  const createMenu: RequestHandler = async (request, response) => {
    const menuItem = await service.createMenu(
      currentActor(request),
      catalogValidate(menuCreateSchema, request.body),
    );
    response.status(201);
    sendSuccess(request, response, { menuItem });
  };
  const updateMenu: RequestHandler = async (request, response) =>
    sendSuccess(request, response, {
      menuItem: await service.updateMenu(
        currentActor(request),
        id(request),
        catalogValidate(menuUpdateSchema, request.body),
      ),
    });
  const recipe: RequestHandler = async (request, response) =>
    sendSuccess(request, response, { recipe: await service.recipe(id(request)) });
  const replaceRecipe: RequestHandler = async (request, response) =>
    sendSuccess(request, response, {
      recipe: await service.replaceRecipe(
        currentActor(request),
        id(request),
        catalogValidate(recipeReplaceSchema, request.body),
      ),
    });
  const availability: RequestHandler = async (request, response) =>
    sendSuccess(request, response, {
      availability: await service.availability(
        id(request),
        catalogValidate(availabilityQuerySchema, request.query).servings,
      ),
    });
  return {
    ingredients,
    ingredient,
    createIngredient,
    updateIngredient,
    categories,
    category,
    createCategory,
    updateCategory,
    menu,
    menuItem,
    createMenu,
    updateMenu,
    recipe,
    availability,
    replaceRecipe,
  };
}
