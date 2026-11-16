import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { env } from '../config/env.js';
import { withUtcSession } from './session-timezone.js';

export function createPrismaClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: withUtcSession(connectionString),
    max: 5,
    connectionTimeoutMillis: 3000,
    query_timeout: 3000,
    statement_timeout: 3000,
  });
  return new PrismaClient({ adapter });
}

export const prisma = createPrismaClient(env.DATABASE_URL);
