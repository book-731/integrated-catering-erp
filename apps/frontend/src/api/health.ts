import { z } from 'zod';
import { getJson } from './client';
export const healthSchema = z.object({
  success: z.literal(true),
  data: z.object({
    status: z.literal('ok'),
    service: z.string(),
    version: z.string(),
    timestamp: z.iso.datetime(),
    database: z.object({ status: z.literal('up'), latencyMs: z.number().nonnegative() }),
  }),
  requestId: z.string(),
});
export type HealthResponse = z.infer<typeof healthSchema>;
export const getHealth = (signal?: AbortSignal) => getJson('/health', healthSchema, signal);
