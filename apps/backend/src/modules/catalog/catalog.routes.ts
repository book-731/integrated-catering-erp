import { Router } from 'express';
import type { AuthRepository } from '../auth/auth.repository.interface.js';
import { AuthService } from '../auth/auth.service.js';
import {
  loadSession,
  requireAuthenticated,
  requireRoles,
  protectCsrf,
} from '../auth/auth.middleware.js';
import { catalogController } from './catalog.controller.js';
export const catalogWriteRoles = ['ADMIN', 'MANAGER'] as const;
export const ingredientReadRoles = ['ADMIN', 'MANAGER', 'KITCHEN'] as const;
export const menuReadRoles = ['ADMIN', 'MANAGER', 'CASHIER', 'KITCHEN'] as const;
export const recipeReadRoles = ['ADMIN', 'MANAGER', 'KITCHEN'] as const;
export function catalogRoutes(repository: AuthRepository) {
  const root = Router(),
    ingredients = Router(),
    categories = Router(),
    menu = Router(),
    controller = catalogController();
  const session = loadSession(new AuthService(repository));
  ingredients.use(session, requireAuthenticated, requireRoles(...ingredientReadRoles));
  ingredients.use((request, response, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) next();
    else requireRoles(...catalogWriteRoles)(request, response, next);
  });
  ingredients.get('/', controller.ingredients);
  ingredients.get('/:id', controller.ingredient);
  ingredients.post(
    '/',
    requireRoles(...catalogWriteRoles),
    protectCsrf,
    controller.createIngredient,
  );
  ingredients.patch(
    '/:id',
    requireRoles(...catalogWriteRoles),
    protectCsrf,
    controller.updateIngredient,
  );
  categories.use(session, requireAuthenticated, requireRoles(...menuReadRoles));
  categories.use((request, response, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) next();
    else requireRoles(...catalogWriteRoles)(request, response, next);
  });
  categories.get('/', controller.categories);
  categories.get('/:id', controller.category);
  categories.post('/', requireRoles(...catalogWriteRoles), protectCsrf, controller.createCategory);
  categories.patch(
    '/:id',
    requireRoles(...catalogWriteRoles),
    protectCsrf,
    controller.updateCategory,
  );
  menu.use(session, requireAuthenticated, requireRoles(...menuReadRoles));
  menu.use((request, response, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) next();
    else requireRoles(...catalogWriteRoles)(request, response, next);
  });
  menu.get('/', controller.menu);
  menu.get('/:id', controller.menuItem);
  menu.get('/:id/recipe', requireRoles(...recipeReadRoles), controller.recipe);
  menu.get(
    '/:id/ingredient-availability',
    requireRoles(...recipeReadRoles),
    controller.availability,
  );
  menu.post('/', requireRoles(...catalogWriteRoles), protectCsrf, controller.createMenu);
  menu.patch('/:id', requireRoles(...catalogWriteRoles), protectCsrf, controller.updateMenu);
  menu.put(
    '/:id/recipe',
    requireRoles(...catalogWriteRoles),
    protectCsrf,
    controller.replaceRecipe,
  );
  // No hard-delete endpoints. Disabling never deletes recipes or referenced records.
  root.use('/ingredients', ingredients);
  root.use('/menu-categories', categories);
  root.use('/menu-items', menu);
  return root;
}
