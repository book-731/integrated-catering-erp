import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';
import type { AuthRepository } from '../auth/auth.repository.interface.js';
import { AuthService } from '../auth/auth.service.js';
import {
  loadSession,
  requireAuthenticated,
  requireRoles,
  protectCsrf,
  currentActor,
} from '../auth/auth.middleware.js';
import { sendSuccess } from '../../common/http.js';
import { catalogValidate } from '../catalog/catalog.validation.js';
import { prisma } from '../../lib/prisma.js';
import { schemas, listQuery, id as uuid } from './validation.js';
import { management, sales, requireItem, json } from './repository.js';
import * as menu from './menu.service.js';
import * as inventory from './inventory.service.js';
import * as orders from './orders.service.js';
import * as purchasing from './purchasing.service.js';
import * as staff from './staff.service.js';
import { reports } from './reports.service.js';
const id = (r: Request) => catalogValidate(uuid, r.params.id);
function allowedData(request: Request, value: unknown): unknown {
  if (request.authContext?.user?.role !== 'CASHIER') return json(value);
  function clean(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === 'object') {
      if ('toJSON' in v) return v;
      return Object.fromEntries(
        Object.entries(v)
          .filter(([k]) => k !== 'recipes')
          .map(([k, x]) => [k, clean(x)]),
      );
    }
    return v;
  }
  return json(clean(value));
}
export function operationsRoutes(repository: AuthRepository) {
  const router = Router();
  router.use(loadSession(new AuthService(repository)), requireAuthenticated);
  const get = (
    path: string,
    roles: Parameters<typeof requireRoles>,
    fn: (r: Request) => Promise<unknown>,
  ) =>
    router.get(path, requireRoles(...roles), async (r, s) =>
      sendSuccess(r, s, allowedData(r, await fn(r))),
    );
  const command = <S extends z.ZodType>(
    path: string,
    schema: S,
    roles: Parameters<typeof requireRoles>,
    fn: (r: Request, input: z.output<S>) => Promise<unknown>,
    method: 'post' | 'put' = 'post',
  ) => {
    const handler: RequestHandler = async (r, s) =>
      sendSuccess(
        r,
        s,
        allowedData(r, await fn(r, catalogValidate(schema as z.ZodType<z.output<S>>, r.body))),
      );
    router[method](path, requireRoles(...roles), protectCsrf, handler);
  };
  get('/menu/:id/configuration', ['ADMIN', 'MANAGER', 'CASHIER', 'KITCHEN'], async (r) => {
    const value = requireItem(await menu.configuration(id(r)));
    if (r.authContext?.user?.role === 'CASHIER')
      return {
        ...value,
        recipes: undefined,
        optionGroups: value.optionGroups.map((g) => ({
          ...g,
          options: g.options.map((o) => ({ ...o, recipes: undefined })),
        })),
      };
    return value;
  });
  command(
    '/menu/:id/bundle',
    schemas.bundle,
    management,
    (r, v) => menu.setBundle(currentActor(r), id(r), v),
    'put',
  );
  command('/option-groups', schemas.group, management, (r, v) =>
    menu.saveGroup(currentActor(r), undefined, v),
  );
  command(
    '/option-groups/:id',
    schemas.group,
    management,
    (r, v) => menu.saveGroup(currentActor(r), id(r), v),
    'put',
  );
  command('/menu-options', schemas.option, management, (r, v) =>
    menu.saveOption(currentActor(r), undefined, v),
  );
  command(
    '/menu-options/:id',
    schemas.option,
    management,
    (r, v) => menu.saveOption(currentActor(r), id(r), v),
    'put',
  );
  get('/stock-movements', ['ADMIN', 'MANAGER', 'KITCHEN'], (r) =>
    inventory.movements(catalogValidate(listQuery, r.query)),
  );
  command('/inventory', schemas.stock, management, (r, v) =>
    inventory.stockCommand(currentActor(r), v),
  );
  get('/orders', ['ADMIN', 'MANAGER', 'CASHIER', 'KITCHEN'], (r) =>
    orders.orders(catalogValidate(listQuery, r.query)),
  );
  get('/orders/:id', ['ADMIN', 'MANAGER', 'CASHIER', 'KITCHEN'], async (r) =>
    requireItem(await prisma.order.findUnique({ where: { id: id(r) }, include: { lines: true } })),
  );
  command('/orders', schemas.order, sales, (r, v) => orders.createOrder(currentActor(r), v));
  command(
    '/orders/:id/status',
    schemas.transition,
    ['ADMIN', 'MANAGER', 'CASHIER', 'KITCHEN'],
    (r, v) => orders.transition(currentActor(r), id(r), v),
  );
  command('/orders/:id/payment', schemas.payment, sales, (r, v) =>
    orders.pay(currentActor(r), id(r), v),
  );
  get('/purchases', management, (r) => purchasing.purchases(catalogValidate(listQuery, r.query)));
  command('/purchases', schemas.purchase, management, (r, v) =>
    purchasing.purchase(currentActor(r), v),
  );
  command('/purchases/:id/status', schemas.purchaseStatus, management, (r, v) =>
    purchasing.purchaseStatus(currentActor(r), id(r), v),
  );
  command('/purchases/:id/receipts', schemas.receipt, management, (r, v) =>
    purchasing.receive(currentActor(r), id(r), v),
  );
  const lists = {
    suppliers: prisma.supplier,
    jobs: prisma.job,
    employees: prisma.employee,
    shifts: prisma.shift,
    attendance: prisma.attendance,
    leaves: prisma.leave,
  };
  // Separate typed delegates preserve Prisma's relation and input checking.
  get('/suppliers', management, async (r) => {
    const q = catalogValidate(listQuery, r.query),
      where = { name: { contains: q.q, mode: 'insensitive' as const } };
    return {
      items: await lists.suppliers.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      total: await lists.suppliers.count({ where }),
      page: q.page,
      pageSize: q.pageSize,
    };
  });
  get('/jobs', management, async (r) => {
    const q = catalogValidate(listQuery, r.query),
      where = { name: { contains: q.q, mode: 'insensitive' as const } };
    return {
      items: await lists.jobs.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      total: await lists.jobs.count({ where }),
      page: q.page,
      pageSize: q.pageSize,
    };
  });
  get('/employees', management, async (r) => {
    const q = catalogValidate(listQuery, r.query),
      where = { name: { contains: q.q, mode: 'insensitive' as const } };
    return {
      items: await lists.employees.findMany({
        where,
        include: { job: true },
        orderBy: { code: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      total: await lists.employees.count({ where }),
      page: q.page,
      pageSize: q.pageSize,
    };
  });
  for (const resource of ['shifts', 'attendance', 'leaves'] as const)
    get(`/${resource}`, management, async (r) => {
      const q = catalogValidate(listQuery, r.query);
      const where = { employee: { name: { contains: q.q, mode: 'insensitive' as const } } };
      const args = {
        where,
        include: { employee: true },
        orderBy: { start: 'desc' as const },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      };
      if (resource === 'shifts')
        return {
          items: await prisma.shift.findMany(args),
          total: await prisma.shift.count({ where }),
          page: q.page,
          pageSize: q.pageSize,
        };
      if (resource === 'attendance')
        return {
          items: await prisma.attendance.findMany(args),
          total: await prisma.attendance.count({ where }),
          page: q.page,
          pageSize: q.pageSize,
        };
      return {
        items: await prisma.leave.findMany(args),
        total: await prisma.leave.count({ where }),
        page: q.page,
        pageSize: q.pageSize,
      };
    });
  for (const method of ['post', 'put'] as const) {
    const suffix = method === 'put' ? '/:id' : '';
    command(
      `/suppliers${suffix}`,
      schemas.supplier,
      management,
      (r, v) => purchasing.supplier(currentActor(r), method === 'put' ? id(r) : undefined, v),
      method,
    );
    command(
      `/jobs${suffix}`,
      schemas.job,
      management,
      (r, v) => staff.job(currentActor(r), method === 'put' ? id(r) : undefined, v),
      method,
    );
    command(
      `/employees${suffix}`,
      schemas.employee,
      management,
      (r, v) => staff.employee(currentActor(r), method === 'put' ? id(r) : undefined, v),
      method,
    );
    command(
      `/shifts${suffix}`,
      schemas.shift,
      management,
      (r, v) => staff.shift(currentActor(r), method === 'put' ? id(r) : undefined, v),
      method,
    );
    command(
      `/attendance${suffix}`,
      schemas.attendance,
      management,
      (r, v) => staff.attendance(currentActor(r), method === 'put' ? id(r) : undefined, v),
      method,
    );
  }
  command('/leaves', schemas.leave, management, (r, v) => staff.leave(currentActor(r), v));
  command('/leaves/:id/status', schemas.leaveStatus, management, (r, v) =>
    staff.leaveStatus(currentActor(r), id(r), v),
  );
  get('/reports', management, (r) => reports(catalogValidate(listQuery, r.query)));
  return router;
}
