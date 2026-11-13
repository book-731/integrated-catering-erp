import { z } from 'zod';
import { roles } from '../config/roles';
import { getJson, sendJson } from './client';
export const userSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string(),
  role: z.enum(roles),
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type User = z.infer<typeof userSchema>;
const sessionSchema = z.object({
  success: z.literal(true),
  data: z.object({
    user: userSchema.nullable(),
    csrfToken: z.string().min(32),
    expiresAt: z.iso.datetime(),
  }),
  requestId: z.string(),
});
export type SessionData = z.infer<typeof sessionSchema>['data'];
let inFlight: Promise<SessionData> | null = null;
export function getSession(): Promise<SessionData> {
  if (!inFlight) {
    const request = getJson('/auth/session', sessionSchema).then((result) => result.data);
    inFlight = request;
    void request
      .finally(() => {
        if (inFlight === request) inFlight = null;
      })
      .catch(() => {});
  }
  return inFlight;
}
export async function login(email: string, password: string): Promise<SessionData> {
  return (await sendJson('/auth/login', 'POST', { email, password }, sessionSchema)).data;
}
export async function logout(): Promise<void> {
  await sendJson(
    '/auth/logout',
    'POST',
    {},
    z.object({
      success: z.literal(true),
      data: z.object({ user: z.null() }),
      requestId: z.string(),
    }),
  );
}
