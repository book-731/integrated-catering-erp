import type { RequestHandler } from 'express';
import { z } from 'zod';
import { sendSuccess } from '../../common/http.js';
import { currentActor } from '../auth/auth.middleware.js';
import {
  createUserSchema,
  updateUserSchema,
  userQuerySchema,
  validate,
} from '../auth/auth.validation.js';
import type { UserQuery } from '../auth/auth.types.js';
import type { UsersService } from './users.service.js';
export function usersController(service: UsersService) {
  const list: RequestHandler = async (request, response) => {
    const input = validate(userQuerySchema, request.query);
    const query: UserQuery = {
      q: input.q,
      page: input.page,
      pageSize: input.pageSize,
      ...(input.role ? { role: input.role } : {}),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
    };
    sendSuccess(request, response, await service.list(query));
  };
  const create: RequestHandler = async (request, response) => {
    const user = await service.create(
      currentActor(request),
      validate(createUserSchema, request.body),
    );
    response.status(201);
    sendSuccess(request, response, { user });
  };
  const update: RequestHandler = async (request, response) => {
    const user = await service.update(
      currentActor(request),
      validate(z.uuid(), request.params.id),
      validate(updateUserSchema, request.body),
    );
    sendSuccess(request, response, { user });
  };
  return { list, create, update };
}
