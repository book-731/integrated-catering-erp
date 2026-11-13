import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, afterEach, describe, it, expect, vi } from 'vitest';
import { AppRoutes } from '../app-routes';
import type { Role } from '../config/roles';
import type { Ingredient, Category, MenuItem, Recipe } from '../api/catalog';
import { setCsrfToken } from '../api/client';
const ingredientId = '12345678-1234-4234-8234-123456789012',
  categoryId = '22345678-1234-4234-8234-123456789012',
  menuId = '32345678-1234-4234-8234-123456789012';
const timestamp = '2026-11-10T06:00:00.000Z',
  csrf = 'c'.repeat(43);
const ingredient: Ingredient = {
  id: ingredientId,
  sku: 'RICE',
  name: '白米',
  unit: 'g',
  stockQuantity: '0.000',
  safetyStock: '10.000',
  isActive: true,
  isLowStock: true,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const category: Category = { id: categoryId, name: '主餐', isActive: true, menuItemCount: 1 };
const meal: MenuItem = {
  id: menuId,
  name: '雞腿飯',
  categoryId,
  category: { id: categoryId, name: '主餐', isActive: true },
  price: '99.90',
  imageUrl: null,
  isActive: true,
  isAvailable: true,
  recipeVersion: 0,
  recipeCount: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const reply = (data: unknown, status = 200) =>
  new Response(
    JSON.stringify(
      status < 400
        ? { success: true, data, requestId: 'ui-catalog' }
        : { success: false, error: data, requestId: 'ui-catalog' },
    ),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
function mockApi({
  role = 'ADMIN',
  count = 1,
  listFailure = false,
  skuFailure = false,
  recipeConflict = false,
  invalidDecimal = false,
}: {
  role?: Role;
  count?: number;
  listFailure?: boolean;
  skuFailure?: boolean;
  recipeConflict?: boolean;
  invalidDecimal?: boolean;
} = {}) {
  const ingredients = Array.from({ length: count }, (_, index) =>
    index
      ? {
          ...ingredient,
          id: `12345678-1234-4234-8234-${String(index).padStart(12, '0')}`,
          sku: `RICE-${index}`,
          name: `白米${index}`,
        }
      : { ...ingredient },
  );
  const categories = [{ ...category }],
    meals = [{ ...meal }];
  let recipe: Recipe = {
    menuItemId: menuId,
    version: 0,
    items: [
      { ingredientId, sku: 'RICE', name: '白米', unit: 'g', quantity: '100.000', isActive: true },
    ],
  };
  const fetcher = vi.fn(async (input: string | URL | Request, options?: RequestInit) => {
    const url = new URL(String(input), 'http://frontend.test'),
      path = url.pathname.replace(/^\/api/, '');
    const method = options?.method ?? 'GET';
    if (path === '/auth/session')
      return reply({
        user: {
          id: '42345678-1234-4234-8234-123456789012',
          email: 'catalog@example.test',
          displayName: '測試管理者',
          role,
          isActive: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        csrfToken: csrf,
        expiresAt: '2026-11-11T00:00:00.000Z',
      });
    if (path === '/ingredients' && method === 'GET' && listFailure) {
      listFailure = false;
      return reply({ code: 'INTERNAL_ERROR', message: '食材查詢暫時失敗。' }, 500);
    }
    if (method === 'GET' && ['/ingredients', '/menu-categories', '/menu-items'].includes(path)) {
      const source =
        path === '/ingredients' ? ingredients : path === '/menu-categories' ? categories : meals;
      const q = url.searchParams.get('q') ?? '',
        active = url.searchParams.get('isActive');
      const filtered = source.filter(
        (item) => item.name.includes(q) && (!active || String(item.isActive) === active),
      );
      const page = Number(url.searchParams.get('page') ?? 1),
        pageSize = Number(url.searchParams.get('pageSize') ?? 20);
      const items = filtered.slice((page - 1) * pageSize, page * pageSize);
      if (invalidDecimal && path === '/ingredients')
        return reply({
          items: items.map((item) => ({ ...item, stockQuantity: 0 })),
          total: filtered.length,
          page,
          pageSize,
        });
      return reply({ items, total: filtered.length, page, pageSize });
    }
    if (path === `/menu-items/${menuId}/recipe` && method === 'GET') return reply({ recipe });
    if (path === `/menu-items/${menuId}/ingredient-availability` && method === 'GET')
      return reply({
        availability: {
          menuItemId: menuId,
          recipeVersion: 0,
          servings: Number(url.searchParams.get('servings') ?? 1),
          canPrepare: false,
          blockers: [],
          reservation: false,
          checkedAt: timestamp,
          items: [
            {
              ingredientId,
              sku: 'RICE',
              name: '白米',
              unit: 'g',
              quantityPerServing: '100.000',
              requiredQuantity: url.searchParams.get('servings') === '2' ? '200.000' : '100.000',
              stockQuantity: '0.000',
              safetyStock: '10.000',
              isLowStock: true,
              isActive: true,
              sufficient: false,
              shortageQuantity: url.searchParams.get('servings') === '2' ? '200.000' : '100.000',
            },
          ],
        },
      });
    if (path === `/menu-items/${menuId}/recipe` && method === 'PUT') {
      if (recipeConflict)
        return reply(
          { code: 'RECIPE_VERSION_CONFLICT', message: '配方已由其他人修改，請重新載入後再編輯。' },
          409,
        );
      const payload = JSON.parse(String(options?.body)) as {
        expectedVersion: number;
        items: { ingredientId: string; quantity: string; unit: string }[];
      };
      recipe = {
        ...recipe,
        version: recipe.version + 1,
        items: payload.items.map((row) => ({ ...row, sku: 'RICE', name: '白米', isActive: true })),
      };
      meals[0]!.recipeCount = recipe.items.length;
      return reply({ recipe });
    }
    const payload = options?.body
      ? (JSON.parse(String(options.body)) as Record<string, unknown>)
      : {};
    if (path === '/ingredients' && method === 'POST') {
      if (skuFailure) {
        skuFailure = false;
        return reply({ code: 'SKU_CONFLICT', message: 'SKU 已被使用。' }, 409);
      }
      const created = {
        ...ingredient,
        ...payload,
        id: '52345678-1234-4234-8234-123456789012',
        safetyStock: '1.250',
      };
      ingredients.push(created);
      return reply({ ingredient: created }, 201);
    }
    if (path === `/ingredients/${ingredientId}` && method === 'PATCH') {
      Object.assign(ingredients[0]!, payload);
      return reply({ ingredient: ingredients[0] });
    }
    if (path === '/menu-categories' && method === 'POST') {
      const created = {
        ...category,
        ...payload,
        id: '62345678-1234-4234-8234-123456789012',
        menuItemCount: 0,
      };
      categories.push(created);
      return reply({ category: created }, 201);
    }
    if (path === `/menu-categories/${categoryId}` && method === 'PATCH') {
      Object.assign(categories[0]!, payload);
      return reply({ category: categories[0] });
    }
    if (path === '/menu-items' && method === 'POST') {
      const created = {
        ...meal,
        ...payload,
        id: '72345678-1234-4234-8234-123456789012',
        recipeCount: 0,
      };
      meals.push(created);
      return reply({ menuItem: created }, 201);
    }
    if (path === `/menu-items/${menuId}` && method === 'PATCH') {
      Object.assign(meals[0]!, payload);
      return reply({ menuItem: meals[0] });
    }
    throw new Error(`Unexpected test API ${method} ${path}`);
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
function start(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
  setCsrfToken(null);
});
async function openIngredientForm() {
  fireEvent.click(await screen.findByRole('button', { name: '新增食材' }));
  const dialog = screen.getByRole('dialog', { name: '新增食材' });
  fireEvent.change(within(dialog).getByLabelText('食材 SKU'), { target: { value: ' bean-01 ' } });
  fireEvent.change(within(dialog).getByLabelText('食材名稱'), { target: { value: '紅豆' } });
  fireEvent.change(within(dialog).getByLabelText('安全庫存'), { target: { value: '1.25' } });
  return dialog;
}

describe('第二階段 B 前端 API 契約與操作', () => {
  it('食材新增只傳 Decimal 字串，庫存唯讀且不在 request 中', async () => {
    const fetcher = mockApi();
    start('/ingredients');
    const dialog = await openIngredientForm();
    expect(within(dialog).getByLabelText('現有庫存（唯讀）')).toHaveAttribute('readonly');
    fireEvent.click(within(dialog).getByRole('button', { name: '儲存' }));
    expect(await screen.findByText('紅豆')).toBeInTheDocument();
    const call = fetcher.mock.calls.find(
      ([url, options]) => String(url).endsWith('/ingredients') && options?.method === 'POST',
    );
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      sku: 'BEAN-01',
      name: '紅豆',
      unit: 'g',
      safetyStock: '1.25',
      isActive: true,
    });
    expect(call?.[1]).toMatchObject({ credentials: 'include', headers: { 'X-CSRF-Token': csrf } });
  });
  it('欄位錯誤阻止食材送出，API 去重失敗可顯示並重新儲存', async () => {
    const fetcher = mockApi({ skuFailure: true });
    start('/ingredients');
    const dialog = await openIngredientForm();
    fireEvent.change(within(dialog).getByLabelText('安全庫存'), { target: { value: '-1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '儲存' }));
    expect(await within(dialog).findByText(/需為非負十進位字串/)).toBeInTheDocument();
    expect(fetcher.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
    fireEvent.change(within(dialog).getByLabelText('安全庫存'), { target: { value: '1.25' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '儲存' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('SKU 已被使用。');
    fireEvent.click(within(dialog).getByRole('button', { name: '儲存' }));
    expect(await screen.findByText('紅豆')).toBeInTheDocument();
  });
  it('食材停用需確認，成功後畫面反映 API 狀態', async () => {
    const fetcher = mockApi();
    start('/ingredients');
    fireEvent.click(await screen.findByRole('button', { name: '停用' }));
    const dialog = screen.getByRole('dialog', { name: '停用資料' });
    fireEvent.click(within(dialog).getByRole('button', { name: '確認' }));
    expect(await screen.findByText('食材已停用，配方關聯保留。')).toBeInTheDocument();
    await waitFor(() =>
      expect(fetcher.mock.calls.find(([, options]) => options?.method === 'PATCH')?.[1]?.body).toBe(
        JSON.stringify({ isActive: false }),
      ),
    );
  });
  it('分頁、搜尋與空白狀態使用真實 API query 契約', async () => {
    const fetcher = mockApi({ count: 21 });
    start('/ingredients');
    await screen.findByText('白米');
    fireEvent.click(screen.getByRole('button', { name: '下一頁' }));
    expect(await screen.findByText('白米20')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('搜尋食材名稱或 SKU'), { target: { value: '找不到' } });
    fireEvent.change(screen.getByLabelText('篩選基礎單位'), { target: { value: 'g' } });
    fireEvent.click(screen.getByRole('button', { name: '套用篩選' }));
    expect(await screen.findByText('沒有符合條件的資料。')).toBeInTheDocument();
    expect(
      fetcher.mock.calls.some(
        ([url]) =>
          String(url).includes('q=%E6%89%BE%E4%B8%8D%E5%88%B0') &&
          String(url).includes('page=1') &&
          String(url).includes('unit=g'),
      ),
    ).toBe(true);
  });
  it('查詢失敗可重試，不將錯誤顯示為空白成功', async () => {
    mockApi({ listFailure: true });
    start('/ingredients');
    expect(await screen.findByRole('alert')).toHaveTextContent('食材查詢暫時失敗。');
    expect(screen.queryByText('沒有符合條件的資料。')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重試' }));
    expect(await screen.findByText('白米')).toBeInTheDocument();
  });
  it('拒絕把 number 庫存回應當成正確 Decimal 契約', async () => {
    mockApi({ invalidDecimal: true });
    start('/ingredients');
    expect(await screen.findByRole('alert')).toHaveTextContent('API 回應格式不符合預期');
  });
  it('新增分類並呈現後端回傳資料', async () => {
    const fetcher = mockApi();
    start('/menu-categories');
    fireEvent.click(await screen.findByRole('button', { name: '新增分類' }));
    const dialog = screen.getByRole('dialog', { name: '新增分類' });
    fireEvent.change(within(dialog).getByLabelText('分類名稱'), { target: { value: ' 飲料 ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '儲存' }));
    expect(await screen.findByText('飲料')).toBeInTheDocument();
    expect(fetcher.mock.calls.find(([, options]) => options?.method === 'POST')?.[1]?.body).toBe(
      JSON.stringify({ name: '飲料', isActive: true }),
    );
  });
  it('餐點價格驗證後以字串送出，圖片空值為 null', async () => {
    const fetcher = mockApi();
    start('/menu-items');
    await screen.findByText('雞腿飯');
    fireEvent.click(screen.getByRole('button', { name: '新增餐點' }));
    const dialog = screen.getByRole('dialog', { name: '新增餐點' });
    fireEvent.change(within(dialog).getByLabelText('餐點名稱'), { target: { value: '紅豆湯' } });
    fireEvent.change(within(dialog).getByLabelText('所屬分類'), { target: { value: categoryId } });
    fireEvent.change(within(dialog).getByLabelText('價格'), { target: { value: '-1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '儲存' }));
    expect(await within(dialog).findByText(/價格需為非負數/)).toBeInTheDocument();
    expect(fetcher.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
    fireEvent.change(within(dialog).getByLabelText('價格'), { target: { value: '25.50' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '儲存' }));
    expect(await screen.findByText('紅豆湯')).toBeInTheDocument();
    expect(
      JSON.parse(
        String(fetcher.mock.calls.find(([, options]) => options?.method === 'POST')?.[1]?.body),
      ),
    ).toMatchObject({ price: '25.50', imageUrl: null, categoryId });
  });
  it('餐點編輯供應設定並顯示 API 結果', async () => {
    const fetcher = mockApi();
    start('/menu-items');
    await screen.findByText('雞腿飯');
    fireEvent.click(screen.getByRole('button', { name: '編輯' }));
    const dialog = screen.getByRole('dialog', { name: '編輯餐點' });
    fireEvent.click(within(dialog).getByLabelText('供應中'));
    fireEvent.click(within(dialog).getByRole('button', { name: '儲存' }));
    expect(await screen.findByText('餐點已儲存。')).toBeInTheDocument();
    expect(screen.getByText('暫停供應')).toBeInTheDocument();
    expect(
      JSON.parse(
        String(fetcher.mock.calls.find(([, options]) => options?.method === 'PATCH')?.[1]?.body),
      ),
    ).toMatchObject({ isAvailable: false });
  });
  it('配方編輯驗證正數、固定基礎單位與版本，移除後再原子儲存', async () => {
    const fetcher = mockApi();
    start('/menu-items');
    fireEvent.click(await screen.findByRole('button', { name: /編輯配方/ }));
    const dialog = screen.getByRole('dialog', { name: '食材配方：雞腿飯' });
    const quantity = await within(dialog).findByLabelText('用量：白米');
    fireEvent.change(quantity, { target: { value: '0' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '儲存配方' }));
    expect(await within(dialog).findByText('配方用量必須大於 0。')).toBeInTheDocument();
    expect(fetcher.mock.calls.some(([, options]) => options?.method === 'PUT')).toBe(false);
    fireEvent.change(quantity, { target: { value: '80.125' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '儲存配方' }));
    expect(await within(dialog).findByText('配方已儲存，未變更庫存。')).toBeInTheDocument();
    let writes = fetcher.mock.calls.filter(([, options]) => options?.method === 'PUT');
    expect(JSON.parse(String(writes[0]?.[1]?.body))).toEqual({
      expectedVersion: 0,
      items: [{ ingredientId, quantity: '80.125', unit: 'g' }],
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '移除：白米' }));
    expect(await within(dialog).findByText('尚未設定配方食材。')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '儲存配方' }));
    await waitFor(() => {
      writes = fetcher.mock.calls.filter(([, options]) => options?.method === 'PUT');
      expect(writes).toHaveLength(2);
    });
    expect(JSON.parse(String(writes[1]?.[1]?.body))).toEqual({ expectedVersion: 1, items: [] });
  });
  it('新增配方食材會防止重複選取，儲存前只編輯本地草稿', async () => {
    const fetcher = mockApi();
    start('/menu-items');
    fireEvent.click(await screen.findByRole('button', { name: /編輯配方/ }));
    const dialog = screen.getByRole('dialog', { name: '食材配方：雞腿飯' });
    await within(dialog).findByLabelText('用量：白米');
    fireEvent.click(within(dialog).getByRole('button', { name: '移除：白米' }));
    const select = await within(dialog).findByLabelText('選擇配方食材');
    fireEvent.change(select, { target: { value: ingredientId } });
    fireEvent.click(within(dialog).getByRole('button', { name: '加入食材' }));
    expect(await within(dialog).findByLabelText('用量：白米')).toHaveValue('1.000');
    expect(within(dialog).getByRole('option', { name: /已加入/ })).toBeDisabled();
    expect(fetcher.mock.calls.some(([, options]) => options?.method === 'PUT')).toBe(false);
  });
  it('版本衝突顯示後端錯誤並保留未儲存草稿', async () => {
    mockApi({ recipeConflict: true });
    start('/menu-items');
    fireEvent.click(await screen.findByRole('button', { name: /編輯配方/ }));
    const dialog = screen.getByRole('dialog', { name: '食材配方：雞腿飯' });
    const input = await within(dialog).findByLabelText('用量：白米');
    fireEvent.change(input, { target: { value: '77.777' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '儲存配方' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('配方已由其他人修改');
    expect(input).toHaveValue('77.777');
    expect(within(dialog).queryByText('配方已儲存，未變更庫存。')).not.toBeInTheDocument();
  });
  it('KITCHEN 配方頁保持唯讀，未開啟庫存查詢前不額外抓取整份庫存清單', async () => {
    const fetcher = mockApi({ role: 'KITCHEN' });
    start('/menu-items');
    fireEvent.click(await screen.findByRole('button', { name: /查看配方/ }));
    const dialog = screen.getByRole('dialog', { name: '食材配方：雞腿飯' });
    expect(await within(dialog).findByText('100.000')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '儲存配方' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '新增餐點' })).not.toBeInTheDocument();
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('/ingredients'))).toBe(false);
  });
  it('KITCHEN 可查看食材庫存、安全庫存與低庫存提醒，但沒有新增或編輯操作', async () => {
    const fetcher = mockApi({ role: 'KITCHEN' });
    start('/ingredients');
    await screen.findByText('白米');
    expect(screen.getByText('0.000')).toBeInTheDocument();
    expect(screen.getByText('10.000')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '新增食材' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '編輯' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '停用' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('篩選庫存提醒'), { target: { value: 'true' } });
    fireEvent.click(screen.getByRole('button', { name: '套用篩選' }));
    await waitFor(() =>
      expect(fetcher.mock.calls.some(([url]) => String(url).includes('lowStock=true'))).toBe(true),
    );
    expect(fetcher.mock.calls.every(([, options]) => options?.method === 'GET')).toBe(true);
  });
  it('KITCHEN 食材足夠性查詢只有 GET，不接受錯誤份數且不提供扣庫操作', async () => {
    const fetcher = mockApi({ role: 'KITCHEN' });
    start('/menu-items');
    fireEvent.click(await screen.findByRole('button', { name: '檢查食材' }));
    const dialog = screen.getByRole('dialog', { name: '食材足夠性：雞腿飯' });
    expect(await within(dialog).findByText('目前無法製作')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('製作份數'), { target: { value: '0' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '查詢食材' }));
    expect(await within(dialog).findByText('份數需為 1–10000 的整數。')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('製作份數'), { target: { value: '2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '查詢食材' }));
    await waitFor(() =>
      expect(
        fetcher.mock.calls.some(([url]) =>
          String(url).includes('ingredient-availability?servings=2'),
        ),
      ).toBe(true),
    );
    expect(fetcher.mock.calls.every(([, options]) => options?.method === 'GET')).toBe(true);
    expect(within(dialog).queryByRole('button', { name: /扣庫|儲存/ })).not.toBeInTheDocument();
  });
  it('CASHIER 僅讀菜單，配方與食材管理不開放', async () => {
    mockApi({ role: 'CASHIER' });
    const view = start('/menu-items');
    await screen.findByText('雞腿飯');
    expect(screen.queryByRole('button', { name: /配方/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '新增餐點' })).not.toBeInTheDocument();
    view.unmount();
    start('/ingredients');
    expect(await screen.findByRole('heading', { name: '權限不足' })).toBeInTheDocument();
  });
});
