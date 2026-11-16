import express, { Router } from 'express';
import type { AuthRepository } from '../auth/auth.repository.interface.js';
import { AuthService } from '../auth/auth.service.js';
import {
  loadSession,
  requireAuthenticated,
  requireRoles,
  protectCsrf,
  protectCsrfFor,
} from '../auth/auth.middleware.js';
import { catalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { catalogRepository } from './catalog.repository.js';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MENU_IMAGE_MAX_BYTES,
  MenuImageStorage,
} from './menu-image-storage.js';
export const catalogWriteRoles = ['ADMIN', 'MANAGER'] as const;
export const ingredientReadRoles = ['ADMIN', 'MANAGER', 'KITCHEN'] as const;
export const menuReadRoles = ['ADMIN', 'MANAGER', 'CASHIER', 'KITCHEN'] as const;
export const recipeReadRoles = ['ADMIN', 'MANAGER', 'KITCHEN'] as const;
export function catalogRoutes(repository: AuthRepository, imageStorage?: MenuImageStorage) {
  const root = Router(),
    ingredients = Router(),
    categories = Router(),
    menu = Router(),
    controller = catalogController(
      new CatalogService(catalogRepository, imageStorage ?? new MenuImageStorage()),
    );
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
  menu.get('/images/:filename', controller.menuImage);
  menu.get('/', controller.menu);
  menu.get('/:id', controller.menuItem);
  menu.get('/:id/recipe', requireRoles(...recipeReadRoles), controller.recipe);
  menu.get(
    '/:id/ingredient-availability',
    requireRoles(...recipeReadRoles),
    controller.availability,
  );
  menu.post(
    '/:id/image',
    requireRoles(...catalogWriteRoles),
    protectCsrfFor(ALLOWED_IMAGE_MIME_TYPES),
    express.raw({ type: [...ALLOWED_IMAGE_MIME_TYPES], limit: MENU_IMAGE_MAX_BYTES }),
    controller.uploadMenuImage,
  );
  menu.delete(
    '/:id/image',
    requireRoles(...catalogWriteRoles),
    protectCsrfFor(),
    controller.deleteMenuImage,
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
