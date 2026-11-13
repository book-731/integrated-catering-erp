// Presentation fixtures only: uses the fixed isolated demo environment and real APIs.
// Never clears old records, resets stock or connects to the development database.
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format } from 'prettier';
import { fileURLToPath } from 'node:url';
import { cli, directory, settings, withDatabase } from './environment.mjs';
import { ApiClient } from './client.mjs';
import { accounts, accountEmail } from './scenario.mjs';

export const presentationFile = resolve(directory, 'presentation.json');
export async function stageDemo() {
  await cli('start');
  const roleEmails = ['ADMIN', 'MANAGER', 'CASHIER', 'KITCHEN'].map(accountEmail);
  const readyAccounts = await withDatabase(
    async (db) =>
      (
        await db.query(
          'SELECT count(*)::int AS n FROM users WHERE email=ANY($1::text[]) AND "isActive"=true',
          [roleEmails],
        )
      ).rows[0].n === 4,
  );
  if (!readyAccounts) await accounts();
  const admin = new ApiClient();
  await admin.login(accountEmail('ADMIN'), settings().accountPassword);
  const command = async (path, body) =>
    (
      await admin.request('/operations' + path, {
        method: 'POST',
        body: { ...body, requestKey: randomUUID() },
      })
    ).data;
  try {
    if (existsSync(presentationFile)) {
      const p = JSON.parse(readFileSync(presentationFile, 'utf8'));
      if (p.schema === 2 && p.database?.sessionTimeZone === 'UTC') {
        const ingredient = (await admin.request(`/ingredients/${p.ids.ingredient}`)).data
          .ingredient;
        const purchases = (
          await admin.request(`/operations/purchases?q=${encodeURIComponent(p.prefix)}`)
        ).data.items;
        const orders = (await admin.request(`/operations/orders?q=${encodeURIComponent(p.prefix)}`))
          .data.items;
        const purchase = purchases.find((v) => v.id === p.ids.purchase);
        const fallback = orders.find((v) => v.id === p.ids.fallbackOrder);
        const completed = orders.find((v) => v.id === p.ids.completedOrder);
        if (
          ingredient.stockQuantity === '1000.000' &&
          purchase?.status === 'ORDERED' &&
          fallback?.status === 'PENDING' &&
          !fallback.paidAt &&
          completed?.status === 'COMPLETED' &&
          orders.length === 2
        ) {
          console.log(`展示資料已就緒並沿用：${p.prefix}（不新增、不重設庫存）。`);
          return p;
        }
      }
    }
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
    const prefix = `DEMO-${today.replaceAll('-', '')}-${randomUUID().slice(0, 6)}`;
    const ids = {};
    ids.ingredient = (
      await admin.request('/ingredients', {
        method: 'POST',
        expected: 201,
        body: { sku: prefix + '-RICE', name: prefix + ' 白米', unit: 'g', safetyStock: '100.000' },
      })
    ).data.ingredient.id;
    await command('/inventory', {
      ingredientId: ids.ingredient,
      type: 'OPENING',
      quantity: '1200.000',
      reason: prefix + ' 展示期初，含備案訂單用量',
    });
    ids.category = (
      await admin.request('/menu-categories', {
        method: 'POST',
        expected: 201,
        body: { name: prefix + ' 主餐' },
      })
    ).data.category.id;
    ids.meal = (
      await admin.request('/menu-items', {
        method: 'POST',
        expected: 201,
        body: { name: prefix + ' 雞腿飯', categoryId: ids.category, price: '120.00' },
      })
    ).data.menuItem.id;
    await admin.request(`/menu-items/${ids.meal}/recipe`, {
      method: 'PUT',
      body: {
        expectedVersion: 0,
        items: [{ ingredientId: ids.ingredient, unit: 'g', quantity: '100.000' }],
      },
    });
    ids.bundle = (
      await admin.request('/menu-items', {
        method: 'POST',
        expected: 201,
        body: { name: prefix + ' 雙人套餐', categoryId: ids.category, price: '230.00' },
      })
    ).data.menuItem.id;
    await admin.request(`/operations/menu/${ids.bundle}/bundle`, {
      method: 'PUT',
      body: { requestKey: randomUUID(), parts: [{ childId: ids.meal, quantity: 2 }] },
    });
    ids.supplier = (
      await command('/suppliers', {
        name: prefix + ' 食材供應商',
        contact: '隔離展示資料',
        isActive: true,
      })
    ).id;
    const purchase = await command('/purchases', {
      supplierId: ids.supplier,
      note: prefix + ' 展示待收貨500g',
      lines: [{ ingredientId: ids.ingredient, unit: 'g', quantity: '500.000', unitCost: '0.08' }],
    });
    ids.purchase = purchase.id;
    ids.purchaseLine = purchase.lines[0].id;
    await command(`/purchases/${ids.purchase}/status`, { status: 'APPROVED' });
    await command(`/purchases/${ids.purchase}/status`, { status: 'ORDERED' });
    const orderBody = {
      type: 'DINE_IN',
      discount: '0.00',
      serviceFee: '0.00',
      lines: [{ menuItemId: ids.meal, quantity: 2, optionIds: [] }],
    };
    let backup = await command('/orders', { ...orderBody, reference: prefix + ' 已完成備案' });
    ids.completedOrder = backup.id;
    backup = await command(`/orders/${backup.id}/status`, {
      expectedRevision: backup.revision,
      status: 'PREPARING',
    });
    backup = await command(`/orders/${backup.id}/payment`, { method: 'CASH' });
    await command(`/orders/${backup.id}/status`, {
      expectedRevision: backup.revision,
      status: 'COMPLETED',
    });
    ids.fallbackOrder = (
      await command('/orders', { ...orderBody, reference: prefix + ' 待處理備案' })
    ).id;
    const stock = (await admin.request(`/ingredients/${ids.ingredient}`)).data.ingredient
      .stockQuantity;
    if (stock !== '1000.000') throw Error('Demo staging stock verification failed.');
    const p = {
      schema: 2,
      preparedAt: new Date().toISOString(),
      today,
      prefix,
      ids,
      database: {
        host: '127.0.0.1',
        port: 55434,
        name: 'restaurant_erp_acceptance_test',
        sessionTimeZone: 'UTC',
      },
      frontend: 'http://localhost:5175/login',
      expected: {
        beforeReceipt: '1000.000',
        receipt: '500.000',
        afterReceipt: '1500.000',
        afterTwoMeals: '1300.000',
        orderTotal: '240.00',
        baselineCategoryRevenue: '240.00',
        categoryRevenueAfterLiveOrder: '480.00',
      },
    };
    writeFileSync(presentationFile, await format(JSON.stringify(p), { parser: 'json' }));
    console.log(
      `展示資料已建立：${prefix}；1000g → 收貨後1500g → 兩份餐點製作後1300g；訂單240.00。`,
    );
    return p;
  } finally {
    await admin.logout();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await stageDemo();
  } catch {
    console.error('展示資料準備失敗，既有資料保留；請檢查服務與登入限流，不要重設資料庫。');
    process.exitCode = 1;
  }
}
