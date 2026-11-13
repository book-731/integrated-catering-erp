import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../common/api-error.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuthRepository } from './auth.repository.interface.js';
import type { Actor, UserCreate, UserUpdate, UserQuery } from './auth.types.js';

const invalidCredentials = () =>
  new ApiError(401, 'INVALID_CREDENTIALS', '帳號或密碼不正確，或帳號無法使用。');
async function assertAdmin(transaction: Prisma.TransactionClient, actor: Actor) {
  const current = await transaction.user.findUnique({ where: { id: actor.id } });
  if (!current?.isActive || current.authVersion !== actor.authVersion)
    throw new ApiError(401, 'UNAUTHENTICATED', '登入已失效，請重新登入。');
  if (current.role !== 'ADMIN') throw new ApiError(403, 'FORBIDDEN', '你沒有操作此功能的權限。');
}
async function assertEmailAvailable(
  transaction: Prisma.TransactionClient,
  email: string,
  exceptId?: string,
) {
  const existing = await transaction.user.findFirst({
    where: {
      email: { equals: email, mode: 'insensitive' },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
  });
  if (existing) throw new ApiError(409, 'EMAIL_CONFLICT', '此 Email 已被使用。');
}
function mapWriteError(error: unknown): never {
  if (error instanceof Error && 'code' in error && error.code === 'P2002')
    throw new ApiError(409, 'EMAIL_CONFLICT', '此 Email 已被使用。');
  throw error;
}

export const authRepository: AuthRepository = {
  findUserByEmail(email) {
    return prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
  },
  async findSession(id) {
    const row = await prisma.session.findUnique({ where: { id }, include: { user: true } });
    if (!row) return null;
    const { user, ...session } = row;
    return { session, user };
  },
  async createAnonymousSession(session) {
    await prisma.session.create({ data: session });
  },
  rotateSession(oldId, expected, session) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${expected.id}::uuid FOR UPDATE`;
      const current = await tx.user.findUnique({ where: { id: expected.id } });
      if (
        !current?.isActive ||
        current.authVersion !== expected.authVersion ||
        current.passwordHash !== expected.passwordHash
      )
        throw invalidCredentials();
      await tx.$queryRaw`SELECT id FROM sessions WHERE id = ${oldId} FOR UPDATE`;
      const previous = await tx.session.findUnique({ where: { id: oldId } });
      if (!previous || previous.expiresAt <= session.createdAt) throw invalidCredentials();
      await tx.session.delete({ where: { id: oldId } });
      await tx.session.create({ data: session });
      return current;
    });
  },
  async touchSession(id, now) {
    return (
      (
        await prisma.session.updateMany({
          where: { id, expiresAt: { gt: now } },
          data: { lastSeenAt: now },
        })
      ).count === 1
    );
  },
  async deleteSession(id) {
    await prisma.session.deleteMany({ where: { id } });
  },
  async consumeLimit(key, now, windowMs) {
    const resetAt = new Date(now.getTime() + windowMs);
    const rows = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
      INSERT INTO auth_rate_limits (key, count, "resetAt") VALUES (${key}, 1, ${resetAt})
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN auth_rate_limits."resetAt" <= ${now} THEN 1 ELSE auth_rate_limits.count + 1 END,
        "resetAt" = CASE WHEN auth_rate_limits."resetAt" <= ${now} THEN ${resetAt} ELSE auth_rate_limits."resetAt" END
      RETURNING count, "resetAt"`;
    const row = rows[0];
    if (!row) throw new Error('Rate limit persistence failed.');
    return row;
  },
  async listUsers(query: UserQuery) {
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.q
        ? {
            OR: [
              { email: { contains: query.q, mode: 'insensitive' } },
              { displayName: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      prisma.user.count({ where }),
    ]);
    return { items, total };
  },
  async createUser(actor: Actor, input: UserCreate) {
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(12002001)::text`;
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${actor.id}::uuid FOR UPDATE`;
        await assertAdmin(tx, actor);
        await assertEmailAvailable(tx, input.email);
        return tx.user.create({ data: input });
      });
    } catch (error) {
      return mapWriteError(error);
    }
  },
  async updateUser(actor: Actor, id: string, input: UserUpdate) {
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(12002001)::text`;
        await tx.$queryRaw`SELECT id FROM users WHERE id IN (${actor.id}::uuid, ${id}::uuid) ORDER BY id FOR UPDATE`;
        await assertAdmin(tx, actor);
        const target = await tx.user.findUnique({ where: { id } });
        if (!target) throw new ApiError(404, 'USER_NOT_FOUND', '找不到此使用者。');
        if (
          actor.id === id &&
          (input.isActive === false || (input.role !== undefined && input.role !== 'ADMIN'))
        )
          throw new ApiError(409, 'SELF_ADMIN_CHANGE', '不可停用或降權目前登入的管理員。');
        if (
          target.isActive &&
          target.role === 'ADMIN' &&
          (input.isActive === false || (input.role !== undefined && input.role !== 'ADMIN'))
        ) {
          const count = await tx.user.count({
            where: { role: 'ADMIN', isActive: true, id: { not: id } },
          });
          if (count === 0)
            throw new ApiError(409, 'LAST_ADMIN', '必須保留至少一位啟用中的管理員。');
        }
        if (input.email !== undefined) await assertEmailAvailable(tx, input.email, id);
        const revoke =
          (input.email !== undefined && input.email !== target.email) ||
          (input.role !== undefined && input.role !== target.role) ||
          (input.isActive !== undefined && input.isActive !== target.isActive) ||
          input.passwordHash !== undefined;
        const user = await tx.user.update({
          where: { id },
          data: { ...input, ...(revoke ? { authVersion: { increment: 1 } } : {}) },
        });
        if (revoke) await tx.session.deleteMany({ where: { userId: id } });
        return user;
      });
    } catch (error) {
      return mapWriteError(error);
    }
  },
  async bootstrapAdmin(input: UserCreate) {
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(12002001)::text`;
        if (await tx.user.count({ where: { role: 'ADMIN', isActive: true } }))
          throw new ApiError(409, 'ADMIN_EXISTS', '已有啟用的管理員，請使用管理介面建立帳號。');
        await assertEmailAvailable(tx, input.email);
        return tx.user.create({ data: { ...input, role: 'ADMIN', isActive: true } });
      });
    } catch (error) {
      return mapWriteError(error);
    }
  },
};
