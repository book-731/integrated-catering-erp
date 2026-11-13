import { z } from 'zod';
import { getJson, sendJson } from './client';
import { userSchema } from './auth';
import type { Role } from '../config/roles';
export interface UserInput {
  email: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  password?: string;
}
export interface UsersQuery {
  q: string;
  role: string;
  isActive: string;
  page: number;
}
const listSchema = z.object({
  success: z.literal(true),
  data: z.object({
    items: z.array(userSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int(),
    pageSize: z.number().int(),
  }),
  requestId: z.string(),
});
const singleSchema = z.object({
  success: z.literal(true),
  data: z.object({ user: userSchema }),
  requestId: z.string(),
});
export async function getUsers(query: UsersQuery, signal?: AbortSignal) {
  const params = new URLSearchParams({ q: query.q, page: String(query.page), pageSize: '20' });
  if (query.role) params.set('role', query.role);
  if (query.isActive) params.set('isActive', query.isActive);
  return (await getJson(`/users?${params}`, listSchema, signal)).data;
}
export const createUser = async (input: UserInput) =>
  (await sendJson('/users', 'POST', input, singleSchema)).data.user;
export const updateUser = async (id: string, input: Partial<UserInput>) =>
  (await sendJson(`/users/${id}`, 'PATCH', input, singleSchema)).data.user;
