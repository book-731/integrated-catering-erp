import { hashPassword } from '../auth/password.js';
import { publicUser, type Actor, type UserUpdate, type UserQuery } from '../auth/auth.types.js';
import type { AuthRepository } from '../auth/auth.repository.interface.js';
import type { z } from 'zod';
import type { createUserSchema, updateUserSchema } from '../auth/auth.validation.js';
export class UsersService {
  constructor(private readonly repository: AuthRepository) {}
  async list(query: UserQuery) {
    const result = await this.repository.listUsers(query);
    return {
      items: result.items.map(publicUser),
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
  async create(actor: Actor, input: z.infer<typeof createUserSchema>) {
    const { password, ...fields } = input;
    return publicUser(
      await this.repository.createUser(actor, {
        ...fields,
        passwordHash: await hashPassword(password),
      }),
    );
  }
  async update(actor: Actor, id: string, input: z.infer<typeof updateUserSchema>) {
    const fields: UserUpdate = {};
    if (input.email !== undefined) fields.email = input.email;
    if (input.displayName !== undefined) fields.displayName = input.displayName;
    if (input.role !== undefined) fields.role = input.role;
    if (input.isActive !== undefined) fields.isActive = input.isActive;
    if (input.password !== undefined) fields.passwordHash = await hashPassword(input.password);
    return publicUser(await this.repository.updateUser(actor, id, fields));
  }
}
