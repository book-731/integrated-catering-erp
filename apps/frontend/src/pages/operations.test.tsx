import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, afterEach, describe, it, expect, vi } from 'vitest';
import { InventoryPage, OrdersPage, PurchasingPage, StaffPage, ReportsPage } from './operations';
import { setCsrfToken } from '../api/client';
let role = 'MANAGER';
vi.mock('../auth/auth-context', () => ({
  useAuth: () => ({ user: { id: 'test', role }, status: 'authenticated' }),
}));
const ingredientId = '12345678-1234-4234-8234-123456789012',
  menuId = '22345678-1234-4234-8234-123456789012';
const response = (data: unknown, status = 200) =>
  new Response(
    JSON.stringify(
      status < 400
        ? { success: true, data, requestId: 'ops-test' }
        : { success: false, error: data, requestId: 'ops-test' },
    ),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
const ingredient = { id: ingredientId, name: '白米', unit: 'g', isActive: true },
  meal = { id: menuId, name: '雞腿飯', price: '100', isActive: true, isAvailable: true };
function mock(fail = false) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method && init.method !== 'GET')
      return fail
        ? response({ code: 'INSUFFICIENT_STOCK', message: '白米庫存不足。' }, 409)
        : response({ id: 'saved' });
    if (url.includes('/configuration')) return response({ optionGroups: [] });
    if (url.includes('/reports'))
      return response({
        revenue: '197.50',
        orderCount: 1,
        procurement: '25.00',
        sales: [{ date: '2026-11-12', revenue: '197.50', orders: 1 }],
        hot: [{ name: '雞腿飯', quantity: 2, amount: '200.00' }],
        stock: [],
        suppliers: [],
        staff: [],
      });
    const items = url.includes('/ingredients')
      ? [ingredient]
      : url.includes('/menu-items')
        ? [meal]
        : url.includes('/suppliers')
          ? [{ id: ingredientId, name: '供應商', isActive: true }]
          : url.includes('/jobs')
            ? [{ id: ingredientId, name: '廚師', isActive: true }]
            : url.includes('/employees')
              ? [{ id: ingredientId, name: '展示員工', isActive: true }]
              : [];
    return response({ items, total: items.length, page: 1, pageSize: 20 });
  });
}
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
  role = 'MANAGER';
  setCsrfToken(null);
});
const start = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);
describe('ERP業務表單', () => {
  it('班表日期轉成ISO時間再送至API', async () => {
    const fetcher = mock();
    vi.stubGlobal('fetch', fetcher);
    start(<StaffPage />);
    fireEvent.click(screen.getByRole('button', { name: '班表' }));
    fireEvent.click(screen.getByRole('button', { name: '新增班表' }));
    const d = screen.getByRole('dialog');
    await within(d).findByRole('option', { name: '展示員工' });
    fireEvent.change(within(d).getByLabelText('員工'), { target: { value: ingredientId } });
    // Native datetime pickers may expose a value before React receives change.
    (within(d).getByLabelText('開始時間') as HTMLInputElement).value = '2026-11-12T10:00';
    (within(d).getByLabelText('結束時間') as HTMLInputElement).value = '2026-11-12T11:00';
    fireEvent.click(within(d).getByRole('button', { name: '確認儲存' }));
    await waitFor(() => {
      const call = fetcher.mock.calls.find(
        ([url, opts]) => String(url) === '/api/operations/shifts' && opts?.method === 'POST',
      );
      expect(call).toBeDefined();
      const body = JSON.parse(String(call![1]!.body));
      expect(body.start).toBe(new Date('2026-11-12T10:00').toISOString());
      expect(body.end).toBe(new Date('2026-11-12T11:00').toISOString());
    });
  });
  it('管理者提交真正庫存命令格式並刷新清單', async () => {
    const fetcher = mock();
    vi.stubGlobal('fetch', fetcher);
    setCsrfToken('token');
    start(<InventoryPage />);
    fireEvent.click(await screen.findByRole('button', { name: '新增庫存異動' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(await within(dialog).findByLabelText('食材'), {
      target: { value: ingredientId },
    });
    await waitFor(() =>
      expect(within(dialog).getByRole('option', { name: '白米 (g)' })).toBeInTheDocument(),
    );
    fireEvent.change(within(dialog).getByLabelText('食材'), { target: { value: ingredientId } });
    fireEvent.change(within(dialog).getByLabelText('異動類型'), { target: { value: 'OPENING' } });
    fireEvent.change(within(dialog).getByLabelText(/數量/), { target: { value: '100.125' } });
    fireEvent.change(within(dialog).getByLabelText('原因'), { target: { value: '正式期初' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '確認儲存' }));
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        '/api/operations/inventory',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('100.125'),
          headers: expect.objectContaining({ 'X-CSRF-Token': 'token' }),
        }),
      ),
    );
  });
  it('Kitchen沒有庫存寫入按鈕或敏感模組導覽', async () => {
    role = 'KITCHEN';
    vi.stubGlobal('fetch', mock());
    start(<InventoryPage />);
    expect(await screen.findByText('目前沒有資料')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '新增庫存異動' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '採購' })).not.toBeInTheDocument();
  });
  it('建立訂單送出整數份數及十進位折扣', async () => {
    const fetcher = mock();
    vi.stubGlobal('fetch', fetcher);
    start(<OrdersPage />);
    fireEvent.click(screen.getByRole('button', { name: '新增訂單' }));
    const d = screen.getByRole('dialog');
    await within(d).findByRole('option', { name: '雞腿飯' });
    fireEvent.change(within(d).getByLabelText('項目1'), { target: { value: menuId } });
    fireEvent.change(within(d).getByLabelText('訂單類型'), { target: { value: 'TAKEAWAY' } });
    fireEvent.change(within(d).getByLabelText('桌號／取餐名稱／外送備註'), {
      target: { value: '測試取餐' },
    });
    fireEvent.click(within(d).getByRole('button', { name: '確認儲存' }));
    await waitFor(() => {
      const call = fetcher.mock.calls.find(
        ([url, opts]) => String(url) === '/api/operations/orders' && opts?.method === 'POST',
      );
      expect(call).toBeDefined();
      const data = JSON.parse(String(call![1]!.body));
      expect(data.lines[0]).toEqual({ menuItemId: menuId, quantity: 1, optionIds: [] });
      expect(data.discount).toBe('0');
    });
  });
  it('庫存API錯誤保留表單並顯示原因', async () => {
    vi.stubGlobal('fetch', mock(true));
    start(<InventoryPage />);
    fireEvent.click(screen.getByRole('button', { name: '新增庫存異動' }));
    const d = screen.getByRole('dialog');
    await within(d).findByRole('option', { name: '白米 (g)' });
    for (const [name, val] of [
      ['食材', ingredientId],
      ['異動類型', 'ISSUE'],
      ['原因', '領料'],
    ] as const)
      fireEvent.change(within(d).getByLabelText(name), { target: { value: val } });
    fireEvent.change(within(d).getByLabelText(/數量/), { target: { value: '100' } });
    fireEvent.click(within(d).getByRole('button', { name: '確認儲存' }));
    expect(await within(d).findByRole('alert')).toHaveTextContent('白米庫存不足');
    expect(d).toBeInTheDocument();
  });
  it('採購與人事表單使用資料庫選項', async () => {
    vi.stubGlobal('fetch', mock());
    const view = start(<PurchasingPage />);
    fireEvent.click(screen.getByRole('button', { name: '新增採購申請' }));
    expect(await screen.findByRole('option', { name: '供應商' })).toBeInTheDocument();
    view.unmount();
    start(<StaffPage />);
    fireEvent.click(screen.getByRole('button', { name: '新增員工' }));
    expect(await screen.findByRole('option', { name: '廚師' })).toBeInTheDocument();
  });
  it('報表呈現API真實數值與熱銷資料', async () => {
    vi.stubGlobal('fetch', mock());
    start(<ReportsPage />);
    expect(await screen.findByText('197.50 TWD')).toBeInTheDocument();
    expect(screen.getByText(/雞腿飯 × 2/)).toBeInTheDocument();
    expect(screen.getByLabelText('銷售分類')).toBeInTheDocument();
  });
});
