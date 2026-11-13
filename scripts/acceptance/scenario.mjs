import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  root,
  directory,
  settings,
  environment,
  withDatabase,
  apiUrl,
  origin,
  ready,
} from './environment.mjs';
import { ApiClient } from './client.mjs';
const roles = ['ADMIN', 'MANAGER', 'CASHIER', 'KITCHEN'];
export const accountEmail = (role) => `${role.toLowerCase()}@team12-demo.example.test`;
export async function accounts() {
  const config = settings();
  const found = await withDatabase(
    async (db) =>
      (await db.query('SELECT id FROM users WHERE email=$1', [accountEmail('ADMIN')])).rowCount,
  );
  if (!found) {
    const r = spawnSync(
      process.execPath,
      [
        resolve(root, 'node_modules/tsx/dist/cli.mjs'),
        resolve(root, 'apps/backend/scripts/bootstrap-admin.ts'),
      ],
      {
        cwd: root,
        env: {
          ...environment(),
          DEV_ADMIN_EMAIL: accountEmail('ADMIN'),
          DEV_ADMIN_PASSWORD: config.accountPassword,
          DEV_ADMIN_NAME: '隔離展示管理員',
        },
        windowsHide: true,
        stdio: 'ignore',
      },
    );
    if (r.status !== 0) throw Error('Isolated administrator bootstrap failed.');
  }
  const admin = new ApiClient();
  await admin.login(accountEmail('ADMIN'), config.accountPassword);
  const users = (await admin.request('/users?pageSize=100')).data.items;
  for (const role of roles.slice(1))
    if (!users.some((u) => u.email === accountEmail(role)))
      await admin.request('/users', {
        method: 'POST',
        expected: 201,
        body: {
          email: accountEmail(role),
          displayName: {
            MANAGER: '隔離展示店長',
            CASHIER: '隔離展示櫃檯',
            KITCHEN: '隔離展示廚房',
          }[role],
          password: config.accountPassword,
          role,
          isActive: true,
        },
      });
  await admin.logout();
}
export async function scenario({ checkMissingResource = true } = {}) {
  await ready();
  await accounts();
  const runId = randomUUID(),
    prefix = `驗收-${runId.slice(0, 8)}`,
    cases = [],
    ids = {};
  const folder = resolve(root, 'docs/verification/acceptance-final');
  mkdirSync(folder, { recursive: true });
  const report = {
    runId,
    prefix,
    database: 'restaurant_erp_acceptance_test',
    port: 55434,
    api: apiUrl,
    frontend: origin,
    startedAt: new Date().toISOString(),
    cases,
    ids,
    passed: false,
  };
  const check = (ok, message) => {
    if (!ok) throw Error(message);
  };
  const test = async (name, fn) => {
    try {
      await fn();
      cases.push({ name, passed: true });
      console.log(`PASS ${name}`);
    } catch (e) {
      cases.push({ name, passed: false, error: e.message });
      throw e;
    }
  };
  const clients = {};
  const config = settings();
  const command = (client, path, body, key = randomUUID(), expected = 200) =>
    client.request('/operations' + path, {
      method: 'POST',
      body: { ...body, requestKey: key },
      expected,
    });
  const ingredient = async (sku, name, unit) => {
    const i = (
      await clients.ADMIN.request('/ingredients', {
        method: 'POST',
        expected: 201,
        body: { sku, name, unit, safetyStock: '10.000' },
      })
    ).data.ingredient;
    return i.id;
  };
  const quantity = async (id) =>
    (await clients.ADMIN.request(`/ingredients/${id}`)).data.ingredient.stockQuantity;
  const ledger = async (id) =>
    withDatabase(async (db) =>
      Number(
        (await db.query('SELECT count(*) AS n FROM stock_movements WHERE "ingredientId"=$1', [id]))
          .rows[0].n,
      ),
    );
  const createOrder = async (menuId = ids.bundle, qty = 2, optionIds = [ids.option]) =>
    command(clients.CASHIER, '/orders', {
      type: 'DINE_IN',
      reference: prefix + ' 桌12',
      discount: '5.00',
      serviceFee: '2.50',
      lines: [{ menuItemId: menuId, quantity: qty, optionIds }],
    });
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const nextDay = new Date(new Date(`${today}T12:00:00+08:00`).getTime() + 86400000)
    .toISOString()
    .slice(0, 10);
  try {
    await test('01 ADMIN與四角色真實登入', async () => {
      for (const role of roles) {
        const client = new ApiClient(),
          u = await client.login(accountEmail(role), config.accountPassword);
        check(u.role === role, 'Role mismatch');
        clients[role] = client;
      }
    });
    if (checkMissingResource)
      await test('02 不存在餐點設定回404', async () => {
        await clients.ADMIN.request(`/operations/menu/${randomUUID()}/configuration`, {
          expected: 404,
        });
      });
    await test('03 食材新增與可追蹤期初庫存', async () => {
      ids.rice = await ingredient(`R-${runId}`, '展示白米 ' + prefix, 'g');
      ids.empty = await ingredient(`E-${runId}`, '不足食材 ' + prefix, '個');
      await command(clients.ADMIN, '/inventory', {
        ingredientId: ids.rice,
        type: 'OPENING',
        quantity: '100.125',
        reason: prefix + '期初盤點',
      });
      check((await quantity(ids.rice)) === '100.125', 'Opening quantity mismatch');
      check((await ledger(ids.rice)) === 1, 'Opening ledger missing');
    });
    await test('04 真實分類、一般餐點與配方', async () => {
      ids.category = (
        await clients.ADMIN.request('/menu-categories', {
          method: 'POST',
          expected: 201,
          body: { name: prefix + ' 主餐' },
        })
      ).data.category.id;
      ids.meal = (
        await clients.ADMIN.request('/menu-items', {
          method: 'POST',
          expected: 201,
          body: { name: prefix + ' 雞腿飯', categoryId: ids.category, price: '100.00' },
        })
      ).data.menuItem.id;
      await clients.ADMIN.request(`/menu-items/${ids.meal}/recipe`, {
        method: 'PUT',
        body: {
          expectedVersion: 0,
          items: [{ ingredientId: ids.rice, unit: 'g', quantity: '2.125' }],
        },
      });
    });
    await test('05 套餐、加購與配方關聯', async () => {
      ids.bundle = (
        await clients.ADMIN.request('/menu-items', {
          method: 'POST',
          expected: 201,
          body: { name: prefix + ' 雙人套餐', categoryId: ids.category, price: '180.00' },
        })
      ).data.menuItem.id;
      await clients.ADMIN.request(`/operations/menu/${ids.bundle}/bundle`, {
        method: 'PUT',
        body: { requestKey: randomUUID(), parts: [{ childId: ids.meal, quantity: 2 }] },
      });
      ids.group = (
        await command(clients.ADMIN, '/option-groups', {
          menuItemId: ids.bundle,
          name: '加飯',
          minSelect: 0,
          maxSelect: 1,
          isActive: true,
        })
      ).data.id;
      ids.option = (
        await command(clients.ADMIN, '/menu-options', {
          groupId: ids.group,
          name: '加飯半克',
          price: '10.50',
          isActive: true,
          recipes: [{ ingredientId: ids.rice, unit: 'g', quantity: '0.500' }],
        })
      ).data.id;
    });
    await test('06 供應商、採購申請與核准訂購', async () => {
      ids.supplier = (
        await command(clients.ADMIN, '/suppliers', {
          name: prefix + ' 供應商',
          contact: '隔離展示用聯絡資料',
          isActive: true,
        })
      ).data.id;
      const p = (
        await command(clients.ADMIN, '/purchases', {
          supplierId: ids.supplier,
          note: prefix + ' 進貨',
          lines: [{ ingredientId: ids.rice, unit: 'g', quantity: '10.000', unitCost: '2.50' }],
        })
      ).data;
      ids.purchase = p.id;
      ids.purchaseLine = p.lines[0].id;
      await command(clients.ADMIN, `/purchases/${p.id}/status`, { status: 'APPROVED' });
      await command(clients.ADMIN, `/purchases/${p.id}/status`, { status: 'ORDERED' });
    });
    await test('07 部分收貨與同請求重送不重複入庫', async () => {
      const key = randomUUID(),
        body = { lines: [{ lineId: ids.purchaseLine, quantity: '4.125' }] },
        a = (await command(clients.ADMIN, `/purchases/${ids.purchase}/receipts`, body, key)).data,
        b = (await command(clients.ADMIN, `/purchases/${ids.purchase}/receipts`, body, key)).data;
      check(a.id === b.id, 'Receipt replay changed identity');
      check((await quantity(ids.rice)) === '104.250', 'Partial receipt mismatch');
    });
    await test('08 超收整筆回滾、完成收貨後數量正確', async () => {
      const n = await ledger(ids.rice);
      await command(
        clients.ADMIN,
        `/purchases/${ids.purchase}/receipts`,
        { lines: [{ lineId: ids.purchaseLine, quantity: '6.000' }] },
        randomUUID(),
        409,
      );
      check((await ledger(ids.rice)) === n, 'Failed receipt left a ledger row');
      await command(clients.ADMIN, `/purchases/${ids.purchase}/receipts`, {
        lines: [{ lineId: ids.purchaseLine, quantity: '5.875' }],
      });
      check((await quantity(ids.rice)) === '110.125', 'Final receipt mismatch');
      await command(
        clients.ADMIN,
        `/purchases/${ids.purchase}/receipts`,
        { lines: [{ lineId: ids.purchaseLine, quantity: '1' }] },
        randomUUID(),
        409,
      );
    });
    let orderBody, orderKey;
    await test('09 CASHIER建立內用套餐訂單並保存價格快照', async () => {
      orderKey = randomUUID();
      orderBody = {
        type: 'DINE_IN',
        reference: prefix + ' 桌12',
        discount: '5.00',
        serviceFee: '2.50',
        lines: [{ menuItemId: ids.bundle, quantity: 2, optionIds: [ids.option] }],
      };
      const o = (await command(clients.CASHIER, '/orders', orderBody, orderKey)).data;
      ids.order = o.id;
      check(o.total === '378.50', 'Server total mismatch');
      check(o.lines[0].snapshot.recipes === undefined, 'Cashier recipe leak');
    });
    await test('10 併發重送訂單去重、不同內容衝突', async () => {
      const [a, b] = await Promise.all([
        command(clients.CASHIER, '/orders', orderBody, orderKey),
        command(clients.CASHIER, '/orders', orderBody, orderKey),
      ]);
      check(a.data.id === ids.order && b.data.id === ids.order, 'Duplicate orders');
      await command(
        clients.CASHIER,
        '/orders',
        { ...orderBody, reference: 'changed' },
        orderKey,
        409,
      );
    });
    await test('11 KITCHEN可查待處理訂單及配方', async () => {
      const list = (
        await clients.KITCHEN.request(
          `/operations/orders?status=PENDING&q=${encodeURIComponent(prefix)}`,
        )
      ).data;
      check(
        list.items.some((o) => o.id === ids.order),
        'Kitchen pending order missing',
      );
      const o = (await clients.KITCHEN.request(`/operations/orders/${ids.order}`)).data;
      check(o.lines[0].snapshot.recipes.length > 0, 'Kitchen recipe missing');
    });
    await test('12 改價與改配方不改歷史快照', async () => {
      const before = (await clients.ADMIN.request(`/operations/orders/${ids.order}`)).data;
      await clients.ADMIN.request(`/menu-items/${ids.bundle}`, {
        method: 'PATCH',
        body: { price: '999.00' },
      });
      await clients.ADMIN.request(`/menu-items/${ids.meal}/recipe`, {
        method: 'PUT',
        body: {
          expectedVersion: 1,
          items: [{ ingredientId: ids.rice, unit: 'g', quantity: '3.000' }],
        },
      });
      const after = (await clients.ADMIN.request(`/operations/orders/${ids.order}`)).data;
      check(
        JSON.stringify(before.lines) === JSON.stringify(after.lines) && after.total === '378.50',
        'Historical order mutated',
      );
    });
    await test('13 製作時依快照精確扣庫且重送不重扣', async () => {
      const key = randomUUID(),
        body = { expectedRevision: 0, status: 'PREPARING' };
      await command(clients.KITCHEN, `/orders/${ids.order}/status`, body, key);
      const count = await ledger(ids.rice);
      await command(clients.KITCHEN, `/orders/${ids.order}/status`, body, key);
      check((await quantity(ids.rice)) === '100.625', 'Snapshot deduction mismatch');
      check((await ledger(ids.rice)) === count, 'Duplicate deduction');
      await command(clients.KITCHEN, `/orders/${ids.order}/status`, body, randomUUID(), 409);
    });
    await test('14 記錄全額付款後由廚房完成訂單', async () => {
      await command(
        clients.KITCHEN,
        `/orders/${ids.order}/status`,
        { expectedRevision: 1, status: 'COMPLETED' },
        randomUUID(),
        409,
      );
      await command(clients.CASHIER, `/orders/${ids.order}/payment`, { method: 'CASH' });
      await command(clients.KITCHEN, `/orders/${ids.order}/status`, {
        expectedRevision: 2,
        status: 'COMPLETED',
      });
    });
    await test('15 庫存不足時狀態、數量、流水均不部分修改', async () => {
      ids.shortMeal = (
        await clients.ADMIN.request('/menu-items', {
          method: 'POST',
          expected: 201,
          body: { name: prefix + ' 不足庫存餐點', categoryId: ids.category, price: '10.00' },
        })
      ).data.menuItem.id;
      await clients.ADMIN.request(`/menu-items/${ids.shortMeal}/recipe`, {
        method: 'PUT',
        body: {
          expectedVersion: 0,
          items: [
            { ingredientId: ids.rice, quantity: '1.000', unit: 'g' },
            { ingredientId: ids.empty, quantity: '1.000', unit: '個' },
          ],
        },
      });
      const o = (await createOrder(ids.shortMeal, 1, [])).data,
        old = await quantity(ids.rice),
        count = await ledger(ids.rice);
      await command(
        clients.KITCHEN,
        `/orders/${o.id}/status`,
        { expectedRevision: 0, status: 'PREPARING' },
        randomUUID(),
        409,
      );
      check(
        (await quantity(ids.rice)) === old && (await ledger(ids.rice)) === count,
        'Insufficient stock partial write',
      );
      check(
        (await clients.ADMIN.request(`/operations/orders/${o.id}`)).data.status === 'PENDING',
        'Failed order state changed',
      );
    });
    await test('16 待處理取消不扣庫、製作後取消不自動回庫', async () => {
      const a = (await createOrder(ids.meal, 1, [])).data,
        old = await quantity(ids.rice);
      await command(clients.CASHIER, `/orders/${a.id}/status`, {
        expectedRevision: 0,
        status: 'CANCELLED',
      });
      check((await quantity(ids.rice)) === old, 'Pending cancellation changed stock');
      const b = (await createOrder(ids.meal, 1, [])).data;
      await command(clients.KITCHEN, `/orders/${b.id}/status`, {
        expectedRevision: 0,
        status: 'PREPARING',
      });
      const consumed = await quantity(ids.rice);
      await command(
        clients.KITCHEN,
        `/orders/${b.id}/status`,
        { expectedRevision: 1, status: 'CANCELLED' },
        randomUUID(),
        403,
      );
      await command(clients.CASHIER, `/orders/${b.id}/status`, {
        expectedRevision: 1,
        status: 'CANCELLED',
      });
      check(
        (await quantity(ids.rice)) === consumed && consumed === '97.625',
        'Cancellation policy mismatch',
      );
    });
    await test('17 員工、職務、班表、出勤與衝突限制', async () => {
      ids.job = (
        await command(clients.ADMIN, '/jobs', { name: prefix + ' 廚師', isActive: true })
      ).data.id;
      ids.employee = (
        await command(clients.ADMIN, '/employees', {
          code: runId,
          name: prefix + ' 展示員工',
          contact: '僅隔離展示',
          jobId: ids.job,
          isActive: true,
        })
      ).data.id;
      const body = {
        employeeId: ids.employee,
        start: `${today}T09:00:00+08:00`,
        end: `${today}T17:00:00+08:00`,
        note: prefix,
        isActive: true,
      };
      ids.shift = (await command(clients.ADMIN, '/shifts', body)).data.id;
      await command(clients.ADMIN, '/shifts', body, randomUUID(), 409);
      ids.attendance = (
        await command(clients.ADMIN, '/attendance', {
          employeeId: ids.employee,
          start: `${today}T09:05:00+08:00`,
          end: `${today}T16:55:00+08:00`,
          note: prefix,
        })
      ).data.id;
      const l = (
        await command(clients.ADMIN, '/leaves', {
          employeeId: ids.employee,
          start: `${nextDay}T09:00:00+08:00`,
          end: `${nextDay}T10:00:00+08:00`,
          reason: prefix,
        })
      ).data;
      await command(clients.ADMIN, `/leaves/${l.id}/status`, { status: 'APPROVED' });
    });
    await test('18 報表與原始訂單、採購、出勤資料一致', async () => {
      await withDatabase(async (db) => {
        // Reproducible midnight regression: timestamptz instants must represent
        // the same Taipei reporting day regardless of PostgreSQL's session zone.
        const query = `SELECT array_agg(id ORDER BY id) AS ids FROM (VALUES
          (1, timestamptz '2026-11-12 15:59:59.999+00'),
          (2, timestamptz '2026-11-12 16:00:00+00'),
          (3, timestamptz '2026-11-13 15:59:59.999+00'),
          (4, timestamptz '2026-11-13 16:00:00+00')) AS sample(id,completed)
          WHERE completed >= '2026-11-13T00:00:00+08:00'::timestamptz
          AND completed < '2026-11-14T00:00:00+08:00'::timestamptz`;
        for (const zone of ['UTC', 'Asia/Taipei']) {
          await db.query('BEGIN READ ONLY');
          try {
            await db.query("SELECT set_config('TimeZone', $1, true)", [zone]);
            check(
              JSON.stringify((await db.query(query)).rows[0].ids) === '[2,3]',
              'Midnight SQL boundary mismatch',
            );
          } finally {
            await db.query('ROLLBACK');
          }
        }
      });
      const result = (
        await clients.ADMIN.request(`/operations/reports?from=${today}&to=${nextDay}`)
      ).data;
      const raw = await withDatabase(async (db) => ({
        sales: (
          await db.query(
            'SELECT COALESCE(sum(total),0)::numeric(12,2)::text AS revenue,count(*)::int AS count FROM orders WHERE status=\'COMPLETED\' AND "completedAt">=$1::timestamptz AND "completedAt"<$2::timestamptz+interval \'1 day\'',
            [`${today}T00:00:00+08:00`, `${nextDay}T00:00:00+08:00`],
          )
        ).rows[0],
        completedAt: (
          await db.query(
            'SELECT (extract(epoch FROM "completedAt")*1000)::bigint::text AS ms FROM orders WHERE id=$1',
            [ids.order],
          )
        ).rows[0].ms,
        stock: (
          await db.query(
            'SELECT "stockQuantity"::text AS actual,(SELECT sum(quantity)::text FROM stock_movements WHERE "ingredientId"=$1) AS ledger FROM ingredients WHERE id=$1',
            [ids.rice],
          )
        ).rows[0],
      }));
      check(
        result.revenue === raw.sales.revenue && result.orderCount === raw.sales.count,
        'Sales SQL mismatch',
      );
      const completed = (await clients.ADMIN.request(`/operations/orders/${ids.order}`)).data;
      check(
        new Date(completed.completedAt).getTime() === Number(raw.completedAt),
        'API timestamp differs from actual database instant',
      );
      check(
        Math.abs(Date.now() - Number(raw.completedAt)) < 120000,
        'Completed timestamp is not near real current time',
      );
      check(
        raw.stock.actual === raw.stock.ledger && raw.stock.actual === '97.625',
        'Ledger reconciliation mismatch',
      );
      const employee = result.staff.find((e) => e.name === prefix + ' 展示員工');
      check(
        employee?.scheduledHours === '8.00' &&
          employee.attendanceHours === '7.83' &&
          employee.leaveHours === '1.00',
        'Staff report mismatch',
      );
      report.expected = {
        orderTotal: '378.50',
        finalRice: '97.625',
        scheduledHours: '8.00',
        attendanceHours: '7.83',
        leaveHours: '1.00',
      };
    });
    await test('19 未登入、CSRF及各角色後端權限', async () => {
      const anonymous = new ApiClient();
      await anonymous.request('/operations/orders', { expected: 401 });
      await clients.KITCHEN.request(`/menu-items/${ids.meal}`, {
        method: 'PATCH',
        body: { price: '1.00' },
        expected: 403,
      });
      await command(
        clients.KITCHEN,
        '/inventory',
        { ingredientId: ids.rice, type: 'IN', quantity: '1.000', reason: prefix },
        randomUUID(),
        403,
      );
      await clients.CASHIER.request('/ingredients', { expected: 403 });
      for (const role of ['KITCHEN', 'CASHIER']) {
        await clients[role].request('/operations/purchases', { expected: 403 });
        await clients[role].request('/users', { expected: 403 });
        await clients[role].request('/operations/reports', { expected: 403 });
      }
      await clients.MANAGER.request('/users', { expected: 403 });
      await clients.ADMIN.request('/operations/inventory', {
        method: 'POST',
        body: {
          requestKey: randomUUID(),
          ingredientId: ids.rice,
          type: 'IN',
          quantity: '1',
          reason: prefix,
        },
        csrf: false,
        expected: 403,
      });
    });
    await test('20 帳號停用撤銷既有Session', async () => {
      const email = `disabled-${runId}@demo.example.test`,
        user = (
          await clients.ADMIN.request('/users', {
            method: 'POST',
            expected: 201,
            body: {
              email,
              password: config.accountPassword,
              displayName: prefix + ' 停用測試',
              role: 'CASHIER',
              isActive: true,
            },
          })
        ).data.user;
      const client = new ApiClient();
      await client.login(email, config.accountPassword);
      await clients.ADMIN.request(`/users/${user.id}`, {
        method: 'PATCH',
        body: { isActive: false },
      });
      await client.request('/operations/orders', { expected: 401 });
    });
    await test('21 四角色登出後均不可存取管理API', async () => {
      for (const role of roles) {
        await clients[role].logout();
        await clients[role].request('/operations/orders', { expected: 401 });
      }
    });
    report.passed = true;
    writeFileSync(
      resolve(directory, 'latest-run.json'),
      JSON.stringify({ runId, prefix, ids, today, nextDay }, null, 2) + '\n',
    );
  } finally {
    report.finishedAt = new Date().toISOString();
    report.total = cases.length;
    report.success = cases.filter((c) => c.passed).length;
    writeFileSync(resolve(folder, 'operational-flow.json'), JSON.stringify(report, null, 2) + '\n');
  }
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const r = await scenario();
    console.log(`營運流程：${r.success}/${r.total} 通過。`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
