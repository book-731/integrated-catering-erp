import { randomUUID, randomBytes } from 'node:crypto';
import request from 'supertest';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/modules/auth/password.js';
import { hashToken } from '../src/modules/auth/auth.service.js';
import { authRepository } from '../src/modules/auth/auth.repository.js';
import { env } from '../src/config/env.js';
import type { Role } from '../src/modules/auth/auth.types.js';
if (process.env.RUN_DB_INTEGRATION !== '1') throw Error('Use isolated runner');
const run = randomUUID(),
  password = randomBytes(24).toString('base64url'),
  userIds: string[] = [],
  sessions = new Set<string>(),
  limits = new Set<string>(),
  ingredients: string[] = [],
  menus: string[] = [],
  categories: string[] = [],
  purchases: string[] = [],
  suppliers: string[] = [],
  employees: string[] = [],
  jobs: string[] = [],
  orders: string[] = [];
const app = createApp({
  authRepository: {
    ...authRepository,
    async consumeLimit(key, now, ms) {
      const k = hashToken(run + key);
      limits.add(k);
      return authRepository.consumeLimit(k, now, ms);
    },
    async createAnonymousSession(s) {
      sessions.add(s.id);
      await authRepository.createAnonymousSession(s);
    },
    async rotateSession(old, u, s) {
      sessions.add(s.id);
      return authRepository.rotateSession(old, u, s);
    },
  },
});
type Client = { agent: ReturnType<typeof request.agent>; headers: Record<string, string> };
const clients = {} as Record<Role, Client>;
async function post(role: Role, path: string, body: object, key = randomUUID()) {
  return clients[role].agent
    .post(`/api/operations${path}`)
    .set(clients[role].headers)
    .send({ ...body, requestKey: key });
}
let ingredientId: string, menuId: string, categoryId: string;
beforeAll(async () => {
  for (const role of ['ADMIN', 'MANAGER', 'CASHIER', 'KITCHEN'] as Role[]) {
    const u = await prisma.user.create({
      data: {
        email: `${role}-${run}@ops.test`,
        displayName: role,
        role,
        passwordHash: await hashPassword(password),
      },
    });
    userIds.push(u.id);
    const agent = request.agent(app),
      anon = await agent.get('/api/auth/session');
    const login = await agent
      .post('/api/auth/login')
      .set('Origin', env.APP_ORIGIN)
      .set('X-CSRF-Token', anon.body.data.csrfToken)
      .send({ email: u.email, password })
      .expect(200);
    clients[role] = {
      agent,
      headers: { Origin: env.APP_ORIGIN, 'X-CSRF-Token': String(login.body.data.csrfToken) },
    };
  }
  const i = await prisma.ingredient.create({
    data: { sku: `OPS-${run}`, name: '整合白米', unit: 'g' },
  });
  ingredientId = i.id;
  ingredients.push(i.id);
  const c = await prisma.menuCategory.create({ data: { name: `OPS-${run}` } });
  categoryId = c.id;
  categories.push(c.id);
  const m = await prisma.menuItem.create({
    data: {
      name: '整合餐點',
      categoryId: c.id,
      price: '100',
      recipes: { create: { ingredientId: i.id, quantity: '2.125' } },
    },
  });
  menuId = m.id;
  menus.push(m.id);
}, 20000);
afterAll(async () => {
  await prisma.commandReceipt.deleteMany({
    where: { OR: userIds.map((id) => ({ id: { startsWith: id + ':' } })) },
  });
  await prisma.stockMovement.deleteMany({ where: { ingredientId: { in: ingredients } } });
  await prisma.orderLine.deleteMany({ where: { orderId: { in: orders } } });
  await prisma.order.deleteMany({ where: { id: { in: orders } } });
  await prisma.goodsReceipt.deleteMany({ where: { purchaseId: { in: purchases } } });
  await prisma.purchaseLine.deleteMany({ where: { purchaseId: { in: purchases } } });
  await prisma.purchase.deleteMany({ where: { id: { in: purchases } } });
  await prisma.supplier.deleteMany({ where: { id: { in: suppliers } } });
  await prisma.shift.deleteMany({ where: { employeeId: { in: employees } } });
  await prisma.attendance.deleteMany({ where: { employeeId: { in: employees } } });
  await prisma.leave.deleteMany({ where: { employeeId: { in: employees } } });
  await prisma.employee.deleteMany({ where: { id: { in: employees } } });
  await prisma.job.deleteMany({ where: { id: { in: jobs } } });
  await prisma.optionRecipe.deleteMany({ where: { ingredientId: { in: ingredients } } });
  await prisma.menuOption.deleteMany({ where: { group: { menuItemId: { in: menus } } } });
  await prisma.optionGroup.deleteMany({ where: { menuItemId: { in: menus } } });
  await prisma.bundlePart.deleteMany({ where: { parentId: { in: menus } } });
  await prisma.recipeIngredient.deleteMany({ where: { menuItemId: { in: menus } } });
  await prisma.menuItem.deleteMany({ where: { id: { in: menus } } });
  await prisma.ingredient.deleteMany({ where: { id: { in: ingredients } } });
  await prisma.menuCategory.deleteMany({ where: { id: { in: categories } } });
  await prisma.session.deleteMany({
    where: { OR: [{ id: { in: [...sessions] } }, { userId: { in: userIds } }] },
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.authRateLimit.deleteMany({ where: { key: { in: [...limits] } } });
  await prisma.$disconnect();
}, 20000);
const stock = (type: string, quantity: string) => ({
  ingredientId,
  type,
  quantity,
  reason: '整合測試',
});
async function order(optionIds: string[] = [], id = menuId) {
  const response = await post('CASHIER', '/orders', {
    type: 'DINE_IN',
    reference: run,
    discount: '5.00',
    serviceFee: '2.50',
    lines: [{ menuItemId: id, quantity: 2, optionIds }],
  });
  expect(response.status).toBe(200);
  orders.push(String(response.body.data.id));
  return response.body.data as {
    id: string;
    revision: number;
    total: string;
    lines: { snapshot: { recipes?: unknown } }[];
  };
}
describe('完整 ERP 真實資料庫整合', () => {
  it('不存在的餐點設定回404而非500', async () => {
    await clients.ADMIN.agent.get(`/api/operations/menu/${randomUUID()}/configuration`).expect(404);
  });
  it('Swagger包含所有新命令、欄位及有效Session方案', async () => {
    const result = await request(app).get('/api/openapi.json').expect(200);
    expect(
      result.body.paths['/operations/orders'].post.requestBody.content['application/json'].schema
        .$ref,
    ).toBe('#/components/schemas/Ops_order');
    expect(result.body.paths['/operations/orders'].post.security[0]).toHaveProperty('CookieAuth');
    expect(result.body.components.schemas.Ops_stock.properties.quantity.type).toBe('string');
  });
  it('未登入所有新模組回401', async () => {
    for (const path of ['/orders', '/reports', '/stock-movements', '/purchases', '/employees'])
      await request(app)
        .get('/api/operations' + path)
        .expect(401);
  });
  it('Kitchen/Cashier 禁止管理API與跨模組資訊', async () => {
    for (const role of ['KITCHEN', 'CASHIER'] as Role[]) {
      for (const path of [
        '/inventory',
        '/purchases',
        '/suppliers',
        '/employees',
        '/jobs',
        '/menu-options',
      ])
        expect((await post(role, path, {})).status).toBe(403);
      await clients[role].agent.get('/api/operations/reports').expect(403);
    }
    await clients.KITCHEN.agent.get('/api/operations/stock-movements').expect(200);
    await clients.CASHIER.agent.get('/api/operations/stock-movements').expect(403);
  });
  it('管理寫入仍需CSRF', async () => {
    await clients.MANAGER.agent
      .post('/api/operations/inventory')
      .send({ ...stock('OPENING', '100'), requestKey: randomUUID() })
      .expect(403);
  });
  it('期初Decimal精確且同key重送只一筆', async () => {
    const key = randomUUID();
    const a = await post('MANAGER', '/inventory', stock('OPENING', '100.125'), key),
      b = await post('MANAGER', '/inventory', stock('OPENING', '100.125'), key);
    expect(a.status).toBe(200);
    expect(b.body.data.id).toBe(a.body.data.id);
    expect(
      (
        await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredientId } })
      ).stockQuantity.toFixed(3),
    ).toBe('100.125');
    expect(await prisma.stockMovement.count({ where: { ingredientId } })).toBe(1);
  });
  it('不同key不可再次期初，同key不同內容409', async () => {
    expect((await post('MANAGER', '/inventory', stock('OPENING', '3'))).status).toBe(409);
    const key = randomUUID();
    await post('MANAGER', '/inventory', stock('IN', '1'), key);
    expect((await post('MANAGER', '/inventory', stock('IN', '2'), key)).status).toBe(409);
  });
  it('領料超額回滾，負數無法送入', async () => {
    const before = await prisma.stockMovement.count({ where: { ingredientId } });
    expect((await post('MANAGER', '/inventory', stock('ISSUE', '10000'))).body.error.code).toBe(
      'INSUFFICIENT_STOCK',
    );
    expect((await post('MANAGER', '/inventory', stock('IN', '-1'))).status).toBe(422);
    expect(await prisma.stockMovement.count({ where: { ingredientId } })).toBe(before);
  });
  it('盤點與耗損留下平衡流水', async () => {
    const a = await post('MANAGER', '/inventory', stock('COUNT', '90.000'));
    expect(a.body.data.after).toBe('90.000');
    const b = await post('MANAGER', '/inventory', stock('WASTE', '0.125'));
    expect(b.body.data.after).toBe('89.875');
  });
  it('有流水不能改食材單位', async () => {
    await clients.MANAGER.agent
      .patch(`/api/ingredients/${ingredientId}`)
      .set(clients.MANAGER.headers)
      .send({ unit: 'kg' })
      .expect(409);
  });
  it('訂單計價由後端保存，Cashier回應不含配方', async () => {
    const o = await order();
    expect(o.total).toBe('197.50');
    expect(o.lines[0]!.snapshot.recipes).toBeUndefined();
    const stored = await prisma.orderLine.findFirstOrThrow({ where: { orderId: o.id } });
    expect(JSON.stringify(stored.snapshot)).toContain('2.125');
  });
  it('訂單同key並發只建立一次', async () => {
    const key = randomUUID(),
      body = {
        type: 'TAKEAWAY',
        reference: run,
        discount: '0',
        serviceFee: '0',
        lines: [{ menuItemId: menuId, quantity: 1, optionIds: [] }],
      };
    const [a, b] = await Promise.all([
      post('CASHIER', '/orders', body, key),
      post('CASHIER', '/orders', body, key),
    ]);
    expect(a.status).toBe(200);
    expect(b.body.data.id).toBe(a.body.data.id);
    orders.push(a.body.data.id);
  });
  it('配方修改不影響舊訂單，併發開始只扣一次', async () => {
    const o = await order();
    await prisma.recipeIngredient.update({
      where: { menuItemId_ingredientId: { menuItemId: menuId, ingredientId } },
      data: { quantity: '3' },
    });
    const before = (await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredientId } }))
      .stockQuantity;
    const [a, b] = await Promise.all([
      post('KITCHEN', `/orders/${o.id}/status`, { expectedRevision: 0, status: 'PREPARING' }),
      post('KITCHEN', `/orders/${o.id}/status`, { expectedRevision: 0, status: 'PREPARING' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const after = (await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredientId } }))
      .stockQuantity;
    expect(before.minus(after).toFixed(3)).toBe('4.250');
    expect(await prisma.stockMovement.count({ where: { source: `order:${o.id}:sale` } })).toBe(1);
  });
  it('付款、完成、營業額真實整合且不能重複付款', async () => {
    const o = await order();
    await post('MANAGER', `/orders/${o.id}/status`, { expectedRevision: 0, status: 'PREPARING' });
    expect(
      (
        await post('MANAGER', `/orders/${o.id}/status`, {
          expectedRevision: 1,
          status: 'COMPLETED',
        })
      ).body.error.code,
    ).toBe('PAYMENT_REQUIRED');
    const key = randomUUID();
    await post('CASHIER', `/orders/${o.id}/payment`, { method: 'CASH' }, key);
    expect((await post('CASHIER', `/orders/${o.id}/payment`, { method: 'CASH' }, key)).status).toBe(
      200,
    );
    expect((await post('CASHIER', `/orders/${o.id}/payment`, { method: 'CASH' })).status).toBe(409);
    await post('MANAGER', `/orders/${o.id}/status`, { expectedRevision: 2, status: 'COMPLETED' });
    const report = await clients.MANAGER.agent.get('/api/operations/reports');
    expect(Number(report.body.data.revenue)).toBeGreaterThanOrEqual(197.5);
    expect(report.body.data.hot.some((v: { name: string }) => v.name === '整合餐點')).toBe(true);
  });
  it('廚房不能取消；製作後取消不回庫', async () => {
    const o = await order();
    await post('MANAGER', `/orders/${o.id}/status`, { expectedRevision: 0, status: 'PREPARING' });
    const before = (await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredientId } }))
      .stockQuantity;
    expect(
      (
        await post('KITCHEN', `/orders/${o.id}/status`, {
          expectedRevision: 1,
          status: 'CANCELLED',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await post('MANAGER', `/orders/${o.id}/status`, {
          expectedRevision: 1,
          status: 'CANCELLED',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredientId } })
      ).stockQuantity.equals(before),
    ).toBe(true);
  });
  it('不足食材使整筆訂單狀態與已扣食材回滾', async () => {
    const i = await prisma.ingredient.create({
      data: { sku: `EMPTY-${run}`, name: '零庫存', unit: 'g' },
    });
    ingredients.push(i.id);
    await prisma.recipeIngredient.create({
      data: { menuItemId: menuId, ingredientId: i.id, quantity: '1' },
    });
    const o = await order(),
      before = (await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredientId } }))
        .stockQuantity;
    const r = await post('KITCHEN', `/orders/${o.id}/status`, {
      expectedRevision: 0,
      status: 'PREPARING',
    });
    expect(r.status).toBe(409);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('PENDING');
    expect(await prisma.stockMovement.count({ where: { source: `order:${o.id}:sale` } })).toBe(0);
    expect(
      (
        await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredientId } })
      ).stockQuantity.equals(before),
    ).toBe(true);
    await prisma.recipeIngredient.delete({
      where: { menuItemId_ingredientId: { menuItemId: menuId, ingredientId: i.id } },
    });
  });
  it('套餐與加購額外食材快照，拒絕巢狀與非法選項', async () => {
    const b = await prisma.menuItem.create({ data: { name: '套餐', categoryId, price: '150' } });
    menus.push(b.id);
    const key = randomUUID();
    await clients.MANAGER.agent
      .put(`/api/operations/menu/${b.id}/bundle`)
      .set(clients.MANAGER.headers)
      .send({ requestKey: key, parts: [{ childId: menuId, quantity: 1 }] })
      .expect(200);
    const g = await post('MANAGER', '/option-groups', {
      menuItemId: b.id,
      name: '加購',
      minSelect: 1,
      maxSelect: 1,
      isActive: true,
    });
    const option = await post('MANAGER', '/menu-options', {
      groupId: g.body.data.id,
      name: '加飯',
      price: '10.50',
      isActive: true,
      recipes: [{ ingredientId, quantity: '1', unit: 'g' }],
    });
    expect(option.status).toBe(200);
    const o = await order([option.body.data.id], b.id);
    expect(o.total).toBe('318.50');
    const line = await prisma.orderLine.findFirstOrThrow({ where: { orderId: o.id } });
    expect(JSON.stringify(line.snapshot)).toContain('加飯');
    const invalid = await post('CASHIER', '/orders', {
      type: 'TAKEAWAY',
      reference: run,
      discount: '0',
      serviceFee: '0',
      lines: [{ menuItemId: b.id, quantity: 1, optionIds: [] }],
    });
    expect(invalid.status).toBe(422);
    await clients.MANAGER.agent
      .put(`/api/operations/menu/${menuId}/bundle`)
      .set(clients.MANAGER.headers)
      .send({ requestKey: randomUUID(), parts: [{ childId: b.id, quantity: 1 }] })
      .expect(409);
  });
  it('採購申請、核准、訂購、部分收貨與重送去重', async () => {
    const s = await post('MANAGER', '/suppliers', {
      name: `供應商-${run}`,
      contact: '測試',
      isActive: true,
    });
    suppliers.push(s.body.data.id);
    const p = await post('MANAGER', '/purchases', {
      supplierId: s.body.data.id,
      note: '測試進貨',
      lines: [{ ingredientId, unit: 'g', quantity: '10', unitCost: '2.50' }],
    });
    expect(p.status).toBe(200);
    purchases.push(p.body.data.id);
    await post('MANAGER', `/purchases/${p.body.data.id}/status`, { status: 'APPROVED' });
    await post('MANAGER', `/purchases/${p.body.data.id}/status`, { status: 'ORDERED' });
    const key = randomUUID(),
      body = { lines: [{ lineId: p.body.data.lines[0].id, quantity: '4.125' }] };
    const a = await post('MANAGER', `/purchases/${p.body.data.id}/receipts`, body, key),
      b = await post('MANAGER', `/purchases/${p.body.data.id}/receipts`, body, key);
    expect(a.status).toBe(200);
    expect(b.body.data.id).toBe(a.body.data.id);
    expect(
      (await prisma.purchase.findUniqueOrThrow({ where: { id: p.body.data.id } })).status,
    ).toBe('PARTIAL');
    expect(
      (
        await post('MANAGER', `/purchases/${p.body.data.id}/receipts`, {
          lines: [{ lineId: p.body.data.lines[0].id, quantity: '6' }],
        })
      ).status,
    ).toBe(409);
    await post('MANAGER', `/purchases/${p.body.data.id}/receipts`, {
      lines: [{ lineId: p.body.data.lines[0].id, quantity: '5.875' }],
    });
    expect(
      (await prisma.purchase.findUniqueOrThrow({ where: { id: p.body.data.id } })).status,
    ).toBe('RECEIVED');
  });
  it('職務、員工、排班衝突、出勤與請假審核', async () => {
    const j = await post('MANAGER', '/jobs', { name: `職務-${run}`, isActive: true });
    jobs.push(j.body.data.id);
    const e = await post('MANAGER', '/employees', {
      code: run,
      name: '測試員工',
      contact: '',
      jobId: j.body.data.id,
      isActive: true,
    });
    employees.push(e.body.data.id);
    const base = {
      employeeId: e.body.data.id,
      start: '2026-11-12T09:00:00+08:00',
      end: '2026-11-12T17:00:00+08:00',
      note: '班次',
      isActive: true,
    };
    const shift = await post('MANAGER', '/shifts', base);
    expect(shift.status).toBe(200);
    expect((await post('MANAGER', '/shifts', base)).status).toBe(409);
    const l = await post('MANAGER', '/leaves', {
      employeeId: e.body.data.id,
      start: base.start,
      end: base.end,
      reason: '請假',
    });
    expect(
      (await post('MANAGER', `/leaves/${l.body.data.id}/status`, { status: 'APPROVED' })).status,
    ).toBe(409);
    await clients.MANAGER.agent
      .put(`/api/operations/shifts/${shift.body.data.id}`)
      .set(clients.MANAGER.headers)
      .send({ ...base, isActive: false, requestKey: randomUUID() })
      .expect(200);
    expect(
      (await post('MANAGER', `/leaves/${l.body.data.id}/status`, { status: 'APPROVED' })).status,
    ).toBe(200);
    expect((await post('MANAGER', '/shifts', base)).status).toBe(409);
    const a = await post('MANAGER', '/attendance', {
      employeeId: e.body.data.id,
      start: base.start,
      end: base.end,
      note: '管理者補登',
    });
    expect(a.status).toBe(200);
    expect(
      (
        await post('MANAGER', '/attendance', {
          employeeId: e.body.data.id,
          start: base.start,
          end: null,
          note: '',
        })
      ).status,
    ).toBe(409);
  });
  it('分類報表依歷史快照而非目前菜單分類', async () => {
    const c = await prisma.menuCategory.create({ data: { name: '新分類-' + run } });
    categories.push(c.id);
    await prisma.menuItem.update({ where: { id: menuId }, data: { categoryId: c.id, price: '1' } });
    const old = await clients.MANAGER.agent
      .get('/api/operations/reports?categoryId=' + categoryId)
      .expect(200);
    expect(old.body.data.revenue).toBe('197.50');
    expect(old.body.data.orderCount).toBe(1);
    const next = await clients.MANAGER.agent
      .get('/api/operations/reports?categoryId=' + c.id)
      .expect(200);
    expect(next.body.data.revenue).toBe('0.00');
  });
  it('無效日期與欄位格式回422', async () => {
    expect(
      (
        await post('MANAGER', '/shifts', {
          employeeId: employees[0],
          start: '2026-11-12T17:00:00+08:00',
          end: '2026-11-12T09:00:00+08:00',
          note: '',
          isActive: true,
        })
      ).status,
    ).toBe(422);
    await clients.MANAGER.agent
      .get('/api/operations/reports?from=2026-11-15&to=2026-11-01')
      .expect(422);
  });
});
