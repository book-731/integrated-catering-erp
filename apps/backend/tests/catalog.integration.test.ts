import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { env } from '../src/config/env.js';
import { hashPassword } from '../src/modules/auth/password.js';
import { authRepository } from '../src/modules/auth/auth.repository.js';
import { hashToken } from '../src/modules/auth/auth.service.js';
import { catalogRepository } from '../src/modules/catalog/catalog.repository.js';
import type { AuthRepository } from '../src/modules/auth/auth.repository.interface.js';
import type { Role, StoredUser } from '../src/modules/auth/auth.types.js';
if (process.env.RUN_DB_INTEGRATION !== '1') throw new Error('Use isolated DB integration runner.');
const runId = randomUUID(),
  prefix = `CB-${runId.slice(0, 8)}`,
  password = randomBytes(24).toString('base64url');
const userIds: string[] = [],
  ingredientIds: string[] = [],
  categoryIds: string[] = [],
  menuIds: string[] = [];
const sessionIds = new Set<string>(),
  limitKeys = new Set<string>();
const users = new Map<Role, StoredUser>();
const repository: AuthRepository = {
  ...authRepository,
  async consumeLimit(key, now, windowMs) {
    const scoped = hashToken(`${runId}:${key}`);
    limitKeys.add(scoped);
    return authRepository.consumeLimit(scoped, now, windowMs);
  },
  async createAnonymousSession(session) {
    sessionIds.add(session.id);
    await authRepository.createAnonymousSession(session);
  },
  async rotateSession(oldId, user, session) {
    sessionIds.add(session.id);
    return authRepository.rotateSession(oldId, user, session);
  },
};
const app = createApp({ authRepository: repository });
type Login = Awaited<ReturnType<typeof login>>;
let admin: Login, manager: Login;
async function login(role: Role) {
  const user = users.get(role)!;
  const agent = request.agent(app);
  const initial = await agent.get('/api/auth/session').expect(200);
  const response = await agent
    .post('/api/auth/login')
    .set('Origin', env.APP_ORIGIN)
    .set('X-CSRF-Token', initial.body.data.csrfToken)
    .send({ email: user.email, password })
    .expect(200);
  return {
    agent,
    csrf: String(response.body.data.csrfToken),
    actor: { id: user.id, authVersion: user.authVersion },
  };
}
const headers = (session: Login) => ({ Origin: env.APP_ORIGIN, 'X-CSRF-Token': session.csrf });
async function ingredient(unit = 'g') {
  const response = await manager.agent
    .post('/api/ingredients')
    .set(headers(manager))
    .send({
      sku: `${prefix}-${randomUUID().slice(0, 8)}`,
      name: `測試米${randomUUID().slice(0, 5)}`,
      unit,
      safetyStock: '0.125',
    })
    .expect(201);
  ingredientIds.push(String(response.body.data.ingredient.id));
  return response.body.data.ingredient as {
    id: string;
    sku: string;
    unit: string;
    safetyStock: string;
    stockQuantity: string;
    isActive: boolean;
  };
}
async function category() {
  const response = await manager.agent
    .post('/api/menu-categories')
    .set(headers(manager))
    .send({ name: `${prefix}-分類-${randomUUID()}` })
    .expect(201);
  categoryIds.push(String(response.body.data.category.id));
  return response.body.data.category as { id: string; name: string };
}
async function menu() {
  const group = await category();
  const response = await manager.agent
    .post('/api/menu-items')
    .set(headers(manager))
    .send({ name: `${prefix}-雞腿飯`, categoryId: group.id, price: '99.90' })
    .expect(201);
  menuIds.push(String(response.body.data.menuItem.id));
  return response.body.data.menuItem as { id: string; categoryId: string; price: string };
}
beforeAll(async () => {
  const digest = await hashPassword(password);
  for (const role of ['ADMIN', 'MANAGER', 'CASHIER', 'KITCHEN'] as const) {
    const user = await prisma.user.create({
      data: {
        email: `${role.toLowerCase()}-${runId}@catalog.test`,
        displayName: 'Catalog測試',
        role,
        passwordHash: digest,
      },
    });
    userIds.push(user.id);
    users.set(role, user);
  }
  admin = await login('ADMIN');
  manager = await login('MANAGER');
});
afterAll(async () => {
  await prisma.recipeIngredient.deleteMany({ where: { menuItemId: { in: menuIds } } });
  await prisma.menuItem.deleteMany({ where: { id: { in: menuIds } } });
  await prisma.ingredient.deleteMany({ where: { id: { in: ingredientIds } } });
  await prisma.menuCategory.deleteMany({ where: { id: { in: categoryIds } } });
  await prisma.session.deleteMany({ where: { id: { in: [...sessionIds] } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds }, email: { contains: runId } } });
  await prisma.authRateLimit.deleteMany({ where: { key: { in: [...limitKeys] } } });
  await prisma.$disconnect();
});
describe('Catalog 真實 PostgreSQL 與 Session API', () => {
  it.each([
    '/api/ingredients',
    '/api/menu-categories',
    '/api/menu-items',
    '/api/menu-items/12345678-1234-4234-8234-123456789012/recipe',
  ])('未登入拒絕 %s', async (path) => {
    await request(app).get(path).expect(401);
    await request(app).post(path).send({}).expect(401);
  });
  it.each(['CASHIER', 'KITCHEN'] as const)('%s 不可寫入食材、分類、餐點或配方', async (role) => {
    const session = await login(role);
    for (const path of ['/api/ingredients', '/api/menu-categories', '/api/menu-items']) {
      await session.agent.post(path).set(headers(session)).send({}).expect(403);
      await session.agent
        .patch(path + '/12345678-1234-4234-8234-123456789012')
        .set(headers(session))
        .send({ isActive: false })
        .expect(403);
    }
    await session.agent
      .put('/api/menu-items/12345678-1234-4234-8234-123456789012/recipe')
      .set(headers(session))
      .send({ expectedVersion: 0, items: [] })
      .expect(403);
  });
  it('四角色可讀菜單，僅廚房與管理角色可讀配方，櫃檯無食材庫存權', async () => {
    const item = await menu();
    for (const role of ['CASHIER', 'KITCHEN'] as const) {
      const session = await login(role);
      await session.agent.get('/api/menu-items').expect(200);
      await session.agent.get('/api/menu-categories').expect(200);
      const recipeResponse = await session.agent
        .get('/api/menu-items/' + item.id + '/recipe')
        .expect(role === 'KITCHEN' ? 200 : 403);
      expect(JSON.stringify(recipeResponse.body)).not.toContain('stockQuantity');
      expect(JSON.stringify(recipeResponse.body)).not.toContain('safetyStock');
      await session.agent.get('/api/ingredients').expect(role === 'KITCHEN' ? 200 : 403);
    }
  });
  it('ADMIN、MANAGER 可新增／修改／停用食材，Decimal 字串與分頁正確', async () => {
    const item = await ingredient();
    expect(item.stockQuantity).toBe('0.000');
    expect(item.safetyStock).toBe('0.125');
    const edited = await admin.agent
      .patch('/api/ingredients/' + item.id)
      .set(headers(admin))
      .send({ name: '已修改白米', safetyStock: '90071992547.993', isActive: false })
      .expect(200);
    expect(edited.body.data.ingredient.safetyStock).toBe('90071992547.993');
    await admin.agent
      .patch('/api/ingredients/' + item.id)
      .set(headers(admin))
      .send({ name: '停用保留' })
      .expect(200);
    expect((await prisma.ingredient.findUniqueOrThrow({ where: { id: item.id } })).isActive).toBe(
      false,
    );
    const result = await manager.agent
      .get('/api/ingredients')
      .query({ q: item.sku.toLowerCase(), isActive: false, unit: 'g', page: 1, pageSize: 1 })
      .expect(200);
    expect(result.body.data.total).toBe(1);
    expect(result.body.data.items).toHaveLength(1);
  });
  it('SKU 不可大小寫或前後空白重複', async () => {
    const item = await ingredient();
    const response = await manager.agent
      .post('/api/ingredients')
      .set(headers(manager))
      .send({ sku: ` ${item.sku.toLowerCase()} `, name: '重複', unit: 'g' })
      .expect(409);
    expect(response.body.error.code).toBe('SKU_CONFLICT');
  });
  it('新增或 PATCH 均拒絕庫存輸入，沒有無紀錄庫存異動', async () => {
    const item = await ingredient();
    await manager.agent
      .patch('/api/ingredients/' + item.id)
      .set(headers(manager))
      .send({ stockQuantity: '100' })
      .expect(422);
    await manager.agent
      .post('/api/ingredients')
      .set(headers(manager))
      .send({ sku: `${prefix}-BAD`, name: '非法期初', unit: 'g', stockQuantity: '100' })
      .expect(422);
    expect(
      (await prisma.ingredient.findUniqueOrThrow({ where: { id: item.id } })).stockQuantity.toFixed(
        3,
      ),
    ).toBe('0.000');
  });
  it('分類名稱去重，停用保留已使用餐點且拒絕建立新關聯', async () => {
    const item = await menu();
    const current = await prisma.menuCategory.findUniqueOrThrow({ where: { id: item.categoryId } });
    await manager.agent
      .post('/api/menu-categories')
      .set(headers(manager))
      .send({ name: ` ${current.name.toLowerCase()} ` })
      .expect(409);
    await manager.agent
      .patch('/api/menu-categories/' + current.id)
      .set(headers(manager))
      .send({ isActive: false })
      .expect(200);
    const response = await manager.agent.get('/api/menu-items/' + item.id).expect(200);
    expect(response.body.data.menuItem.category.isActive).toBe(false);
    await manager.agent
      .post('/api/menu-items')
      .set(headers(manager))
      .send({ name: '不應建立', categoryId: current.id, price: '1' })
      .expect(409);
    await manager.agent
      .delete('/api/menu-categories/' + current.id)
      .set(headers(manager))
      .send({})
      .expect(404);
    expect(await prisma.menuItem.count({ where: { id: item.id } })).toBe(1);
  });
  it('餐點 Decimal 價格、供應狀態、圖片與停用，拒絕負值／number', async () => {
    const item = await menu();
    expect(item.price).toBe('99.90');
    for (const price of ['-0.01', '1.001', 0.1])
      await manager.agent
        .patch('/api/menu-items/' + item.id)
        .set(headers(manager))
        .send({ price })
        .expect(422);
    const response = await manager.agent
      .patch('/api/menu-items/' + item.id)
      .set(headers(manager))
      .send({
        price: '0.10',
        isAvailable: false,
        imageUrl: 'https://example.test/meal.jpg',
        isActive: false,
      })
      .expect(200);
    expect(response.body.data.menuItem.price).toBe('0.10');
    expect(response.body.data.menuItem.isAvailable).toBe(false);
    expect(await prisma.menuItem.count({ where: { id: item.id } })).toBe(1);
  });
  it('配方整筆新增／修改／移除，多對多與精度保留，庫存不變', async () => {
    const rice = await ingredient(),
      leg = await ingredient('個'),
      dish = await menu(),
      other = await menu();
    const result = await manager.agent
      .put(`/api/menu-items/${dish.id}/recipe`)
      .set(headers(manager))
      .send({
        expectedVersion: 0,
        items: [
          { ingredientId: rice.id, quantity: '100.125', unit: 'g' },
          { ingredientId: leg.id, quantity: '1', unit: '個' },
        ],
      })
      .expect(200);
    expect(result.body.data.recipe.version).toBe(1);
    expect(result.body.data.recipe.items).toHaveLength(2);
    await manager.agent
      .put(`/api/menu-items/${other.id}/recipe`)
      .set(headers(manager))
      .send({
        expectedVersion: 0,
        items: [{ ingredientId: rice.id, quantity: '0.001', unit: 'g' }],
      })
      .expect(200);
    const changed = await manager.agent
      .put(`/api/menu-items/${dish.id}/recipe`)
      .set(headers(manager))
      .send({
        expectedVersion: 1,
        items: [{ ingredientId: rice.id, quantity: '80.015', unit: 'g' }],
      })
      .expect(200);
    expect(changed.body.data.recipe.items[0].quantity).toBe('80.015');
    expect(await prisma.recipeIngredient.count({ where: { ingredientId: rice.id } })).toBe(2);
    expect(
      (await prisma.ingredient.findUniqueOrThrow({ where: { id: rice.id } })).stockQuantity.toFixed(
        3,
      ),
    ).toBe('0.000');
  });
  it('配方拒絕重複、零用量與單位不一致，原資料不變', async () => {
    const food = await ingredient(),
      dish = await menu(),
      row = { ingredientId: food.id, quantity: '1', unit: 'g' };
    await manager.agent
      .put(`/api/menu-items/${dish.id}/recipe`)
      .set(headers(manager))
      .send({ expectedVersion: 0, items: [row, row] })
      .expect(409);
    for (const change of [{ quantity: '0' }, { quantity: '0.0001' }, { unit: 'kg' }])
      await manager.agent
        .put(`/api/menu-items/${dish.id}/recipe`)
        .set(headers(manager))
        .send({ expectedVersion: 0, items: [{ ...row, ...change }] })
        .expect(422);
    expect(await prisma.recipeIngredient.count({ where: { menuItemId: dish.id } })).toBe(0);
    expect(
      (await prisma.menuItem.findUniqueOrThrow({ where: { id: dish.id } })).recipeVersion,
    ).toBe(0);
  });
  it('食材在配方中不可換單位／刪除，停用保留關聯及只讀用量', async () => {
    const food = await ingredient(),
      dish = await menu(),
      row = { ingredientId: food.id, quantity: '1', unit: 'g' };
    await manager.agent
      .put(`/api/menu-items/${dish.id}/recipe`)
      .set(headers(manager))
      .send({ expectedVersion: 0, items: [row] })
      .expect(200);
    await manager.agent
      .patch('/api/ingredients/' + food.id)
      .set(headers(manager))
      .send({ unit: 'kg' })
      .expect(409);
    await manager.agent
      .delete('/api/ingredients/' + food.id)
      .set(headers(manager))
      .send({})
      .expect(404);
    await expect(prisma.ingredient.delete({ where: { id: food.id } })).rejects.toMatchObject({
      code: 'P2003',
    });
    await manager.agent
      .patch('/api/ingredients/' + food.id)
      .set(headers(manager))
      .send({ isActive: false })
      .expect(200);
    const saved = await manager.agent
      .put(`/api/menu-items/${dish.id}/recipe`)
      .set(headers(manager))
      .send({ expectedVersion: 1, items: [row] })
      .expect(200);
    expect(saved.body.data.recipe.items[0].isActive).toBe(false);
    await manager.agent
      .put(`/api/menu-items/${dish.id}/recipe`)
      .set(headers(manager))
      .send({ expectedVersion: 2, items: [{ ...row, quantity: '2' }] })
      .expect(409);
    await manager.agent
      .patch('/api/menu-items/' + dish.id)
      .set(headers(manager))
      .send({ isActive: false })
      .expect(200);
    await manager.agent
      .put(`/api/menu-items/${dish.id}/recipe`)
      .set(headers(manager))
      .send({ expectedVersion: 2, items: [] })
      .expect(409);
    expect(await prisma.recipeIngredient.count({ where: { menuItemId: dish.id } })).toBe(1);
  });
  it('配方併發更新只有一個成功，過期版本不覆蓋資料', async () => {
    const dish = await menu(),
      food = await ingredient();
    const payload = {
      expectedVersion: 0,
      items: [{ ingredientId: food.id, quantity: '1', unit: 'g' }],
    };
    const results = await Promise.all([
      manager.agent.put(`/api/menu-items/${dish.id}/recipe`).set(headers(manager)).send(payload),
      admin.agent
        .put(`/api/menu-items/${dish.id}/recipe`)
        .set(headers(admin))
        .send({ ...payload, items: [] }),
    ]);
    expect(results.map((value) => value.status).sort()).toEqual([200, 409]);
    expect(
      (await prisma.menuItem.findUniqueOrThrow({ where: { id: dish.id } })).recipeVersion,
    ).toBe(1);
  });
  it('插入階段發生真實 DB 數值溢位，先前刪除與版本均 rollback', async () => {
    const dish = await menu(),
      food = await ingredient();
    await catalogRepository.replaceRecipe(manager.actor, dish.id, {
      expectedVersion: 0,
      items: [{ ingredientId: food.id, quantity: '1', unit: 'g' }],
    });
    // Deliberately bypass HTTP validation to simulate a storage failure after deleting old rows.
    await expect(
      catalogRepository.replaceRecipe(manager.actor, dish.id, {
        expectedVersion: 1,
        items: [{ ingredientId: food.id, quantity: '999999999999999999999999999', unit: 'g' }],
      }),
    ).rejects.toThrow();
    const row = await prisma.recipeIngredient.findUniqueOrThrow({
      where: { menuItemId_ingredientId: { menuItemId: dish.id, ingredientId: food.id } },
    });
    expect(row.quantity.toFixed(3)).toBe('1.000');
    expect(
      (await prisma.menuItem.findUniqueOrThrow({ where: { id: dish.id } })).recipeVersion,
    ).toBe(1);
  });
  it('KITCHEN 可讀庫存／安全庫存與提醒，後端拒絕新增修改刪除及管理員操作', async () => {
    const food = await ingredient(),
      kitchen = await login('KITCHEN');
    const result = await kitchen.agent
      .get('/api/ingredients')
      .query({ q: food.sku, lowStock: true })
      .expect(200);
    expect(result.body.data.total).toBe(1);
    expect(result.body.data.items[0]).toMatchObject({
      stockQuantity: '0.000',
      safetyStock: '0.125',
      unit: 'g',
      isLowStock: true,
    });
    const single = await kitchen.agent.get('/api/ingredients/' + food.id).expect(200);
    for (const field of ['purchasePrice', 'supplier', 'supplierId', 'passwordHash'])
      expect(single.body.data.ingredient).not.toHaveProperty(field);
    await kitchen.agent
      .get('/api/ingredients')
      .query({ q: food.sku, lowStock: false })
      .expect(200)
      .then((response) => expect(response.body.data.total).toBe(0));
    await kitchen.agent
      .post('/api/ingredients')
      .set(headers(kitchen))
      .send({ sku: 'ATTEMPT', name: '不可新增', unit: 'g' })
      .expect(403);
    await kitchen.agent
      .patch('/api/ingredients/' + food.id)
      .set(headers(kitchen))
      .send({ name: '不可修改', stockQuantity: '999' })
      .expect(403);
    await kitchen.agent
      .delete('/api/ingredients/' + food.id)
      .set(headers(kitchen))
      .send({})
      .expect(403);
    await kitchen.agent.get('/api/users').expect(403);
    await kitchen.agent.get('/api/purchases').expect(404);
    expect(
      (await prisma.ingredient.findUniqueOrThrow({ where: { id: food.id } })).stockQuantity.toFixed(
        3,
      ),
    ).toBe('0.000');
  });
  it('依配方檢查多份食材足夠性，Decimal 精確且不保留／扣除庫存，櫃檯無權', async () => {
    // Isolated test storage fixture only; no product API can set opening stock.
    const food = await prisma.ingredient.create({
      data: {
        sku: `${prefix}-CHECK-${randomUUID().slice(0, 8)}`,
        name: '唯讀查詢測試原料',
        unit: 'g',
        stockQuantity: '2.500',
        safetyStock: '1.000',
      },
    });
    ingredientIds.push(food.id);
    const dish = await menu();
    await catalogRepository.replaceRecipe(manager.actor, dish.id, {
      expectedVersion: 0,
      items: [{ ingredientId: food.id, quantity: '1.250', unit: 'g' }],
    });
    const kitchen = await login('KITCHEN');
    const enough = await kitchen.agent
      .get(`/api/menu-items/${dish.id}/ingredient-availability`)
      .query({ servings: '2' })
      .expect(200);
    expect(enough.body.data.availability).toMatchObject({
      canPrepare: true,
      servings: 2,
      reservation: false,
      recipeVersion: 1,
    });
    expect(enough.body.data.availability.items[0]).toMatchObject({
      requiredQuantity: '2.500',
      stockQuantity: '2.500',
      shortageQuantity: '0.000',
      sufficient: true,
    });
    const short = await kitchen.agent
      .get(`/api/menu-items/${dish.id}/ingredient-availability`)
      .query({ servings: '3' })
      .expect(200);
    expect(short.body.data.availability.canPrepare).toBe(false);
    expect(short.body.data.availability.items[0].shortageQuantity).toBe('1.250');
    expect(
      (await prisma.ingredient.findUniqueOrThrow({ where: { id: food.id } })).stockQuantity.toFixed(
        3,
      ),
    ).toBe('2.500');
    expect(
      (await prisma.menuItem.findUniqueOrThrow({ where: { id: dish.id } })).recipeVersion,
    ).toBe(1);
    const cashier = await login('CASHIER');
    await cashier.agent.get(`/api/menu-items/${dish.id}/ingredient-availability`).expect(403);
    await manager.agent
      .patch('/api/ingredients/' + food.id)
      .set(headers(manager))
      .send({ unit: 'kg' })
      .expect(409);
  });
  it('空配方、停用或停供不會誤判可製作', async () => {
    const dish = await menu();
    const empty = await manager.agent
      .get(`/api/menu-items/${dish.id}/ingredient-availability`)
      .expect(200);
    expect(empty.body.data.availability).toMatchObject({
      canPrepare: false,
      blockers: ['尚未設定配方'],
    });
    await manager.agent
      .patch('/api/menu-items/' + dish.id)
      .set(headers(manager))
      .send({ isActive: false, isAvailable: false })
      .expect(200);
    const blocked = await manager.agent
      .get(`/api/menu-items/${dish.id}/ingredient-availability`)
      .expect(200);
    expect(blocked.body.data.availability.canPrepare).toBe(false);
    expect(blocked.body.data.availability.blockers).toEqual(
      expect.arrayContaining(['餐點已停用', '餐點暫停供應']),
    );
  });
  it('食材足夠性查詢拒絕非整數份數與未登入，沒有寫入端點', async () => {
    const dish = await menu();
    for (const servings of ['0', '-1', '1.5', '1e2', '10001'])
      await manager.agent
        .get(`/api/menu-items/${dish.id}/ingredient-availability`)
        .query({ servings })
        .expect(422);
    await request(app).get(`/api/menu-items/${dish.id}/ingredient-availability`).expect(401);
    const kitchen = await login('KITCHEN');
    await kitchen.agent
      .post(`/api/menu-items/${dish.id}/ingredient-availability`)
      .set(headers(kitchen))
      .send({ servings: 1 })
      .expect(403);
  });
  it('寫入驗 CSRF，且驗權後操作者停用也不可繼續寫入', async () => {
    await manager.agent
      .post('/api/menu-categories')
      .set('Origin', env.APP_ORIGIN)
      .send({ name: '拒絕' })
      .expect(403);
    const user = await prisma.user.create({
      data: {
        email: `revoked-${runId}@catalog.test`,
        displayName: '待撤銷',
        role: 'MANAGER',
        passwordHash: await hashPassword(password),
      },
    });
    userIds.push(user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: { isActive: false, authVersion: { increment: 1 } },
    });
    await expect(
      catalogRepository.createCategory(
        { id: user.id, authVersion: 0 },
        { name: `${prefix}-不可寫`, isActive: true },
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});
