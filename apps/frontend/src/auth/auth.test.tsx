import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../app-routes';
import type { User } from '../api/auth';
import { setCsrfToken } from '../api/client';

const csrf = 'a'.repeat(43);
const admin: User = {
  id: '12345678-1234-4234-8234-123456789012',
  displayName: '測試管理員',
  email: 'admin@example.test',
  role: 'ADMIN',
  isActive: true,
  createdAt: '2026-11-10T06:00:00.000Z',
  updatedAt: '2026-11-10T06:00:00.000Z',
};
const member: User = {
  ...admin,
  id: '22345678-1234-4234-8234-123456789012',
  displayName: '櫃檯成員',
  email: 'cashier@example.test',
  role: 'CASHIER',
};
const reply = (data: unknown, status = 200) =>
  new Response(
    JSON.stringify(
      status < 400
        ? { success: true, data, requestId: 'ui-request' }
        : { success: false, error: data, requestId: 'ui-request' },
    ),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
function mockApi(initial: User | null = null) {
  let current = initial;
  const items = [{ ...admin }, { ...member }];
  const fetcher = vi.fn(async (input: string | URL | Request, options?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/auth/session'))
      return reply({ user: current, csrfToken: csrf, expiresAt: '2026-11-11T00:00:00.000Z' });
    if (url.endsWith('/auth/login')) {
      current = admin;
      return reply({ user: current, csrfToken: csrf, expiresAt: '2026-11-11T00:00:00.000Z' });
    }
    if (url.endsWith('/auth/logout')) {
      current = null;
      return reply({ user: null });
    }
    if (url.endsWith('/health'))
      return reply({
        status: 'ok',
        service: 'restaurant-erp-api',
        version: '0.1.0',
        timestamp: '2026-11-10T06:00:00.000Z',
        database: { status: 'up', latencyMs: 1 },
      });
    if (url.includes('/users?'))
      return reply({ items, total: items.length, page: 1, pageSize: 20 });
    if (url.endsWith('/users') && options?.method === 'POST') {
      const inputUser = JSON.parse(String(options.body)) as Partial<User>;
      const created = { ...member, ...inputUser, id: '32345678-1234-4234-8234-123456789012' };
      items.push(created);
      return reply({ user: created }, 201);
    }
    if (url.endsWith(`/users/${member.id}`) && options?.method === 'PATCH') {
      Object.assign(items[1]!, JSON.parse(String(options.body)) as Partial<User>);
      return reply({ user: items[1] });
    }
    if (url.endsWith(`/users/${admin.id}`) && options?.method === 'PATCH') {
      Object.assign(items[0]!, JSON.parse(String(options.body)) as Partial<User>);
      current = items[0]!;
      return reply({ user: current });
    }
    throw new Error(`Unexpected test endpoint ${url}`);
  });
  vi.stubGlobal('fetch', fetcher);
  return {
    fetcher,
    expire: () => {
      current = null;
    },
  };
}
const start = (path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
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

describe('登入狀態、受保護路由與管理操作', () => {
  it('未登入進入受保護網址時導向登入頁，不呼叫使用者 API', async () => {
    const { fetcher } = mockApi();
    start('/users');
    expect(await screen.findByRole('heading', { name: '登入管理系統' })).toBeInTheDocument();
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('/users'))).toBe(false);
  });
  it('登入真正送出 API 契約、Cookie credentials 與 CSRF，顯示管理員導覽', async () => {
    const { fetcher } = mockApi();
    start();
    await screen.findByLabelText('Email');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: admin.email } });
    fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'ui-only-test-input' } });
    fireEvent.click(screen.getByRole('button', { name: '登入系統' }));
    expect(await screen.findByText(admin.displayName)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '使用者與權限' })).toHaveAttribute('href', '/users');
    const call = fetcher.mock.calls.find(([url]) => String(url).endsWith('/auth/login'));
    expect(call?.[1]).toMatchObject({
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
    });
    // All seven modules now have authenticated routes.
    expect(screen.queryAllByText('待開發')).toHaveLength(0);
    expect(screen.getByRole('link', { name: '菜單與商品' })).toHaveAttribute('href', '/menu-items');
  });
  it('密碼錯誤會顯示 API 訊息，維持未登入', async () => {
    const { fetcher } = mockApi();
    fetcher
      .mockImplementationOnce(async () =>
        reply({ user: null, csrfToken: csrf, expiresAt: '2026-11-11T00:00:00.000Z' }),
      )
      .mockImplementationOnce(async () =>
        reply({ code: 'INVALID_CREDENTIALS', message: '帳號或密碼不正確。' }, 401),
      );
    start('/login');
    await screen.findByLabelText('Email');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: admin.email } });
    fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'wrong-input' } });
    fireEvent.click(screen.getByRole('button', { name: '登入系統' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('帳號或密碼不正確。');
    expect(screen.queryByRole('button', { name: '登出' })).not.toBeInTheDocument();
  });
  it('非 ADMIN 直接進入使用者管理頁會看到 403，導覽不顯示管理功能', async () => {
    mockApi(member);
    start('/users');
    expect(await screen.findByRole('heading', { name: '權限不足' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '使用者與權限' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '新增使用者' })).not.toBeInTheDocument();
  });
  it('登出呼叫後端並重新取得匿名 Session，返回登入頁', async () => {
    const { fetcher } = mockApi(admin);
    start();
    fireEvent.click(await screen.findByRole('button', { name: '登出' }));
    expect(await screen.findByRole('heading', { name: '登入管理系統' })).toBeInTheDocument();
    expect(
      fetcher.mock.calls.find(([url]) => String(url).endsWith('/auth/logout'))?.[1],
    ).toMatchObject({ method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': csrf } });
  });
  it('切回視窗時重新確認帳號狀態，失效後返回登入頁', async () => {
    const { expire } = mockApi(admin);
    start();
    await screen.findByRole('button', { name: '登出' });
    expire();
    fireEvent(window, new Event('focus'));
    expect(await screen.findByRole('heading', { name: '登入管理系統' })).toBeInTheDocument();
  });
  it('登入服務中斷時顯示錯誤並可重新連線', async () => {
    const { fetcher } = mockApi();
    fetcher.mockRejectedValueOnce(new TypeError('offline'));
    start();
    expect(await screen.findByRole('alert')).toHaveTextContent('無法連線至後端');
    fireEvent.click(screen.getByRole('button', { name: '重新連線' }));
    expect(await screen.findByRole('heading', { name: '登入管理系統' })).toBeInTheDocument();
  });
  it('使用者新增對話框驗證欄位後才送出 API，顯示新增資料', async () => {
    const { fetcher } = mockApi(admin);
    start('/users');
    fireEvent.click(await screen.findByRole('button', { name: '新增使用者' }));
    const dialog = screen.getByRole('dialog', { name: '新增使用者' });
    fireEvent.click(within(dialog).getByRole('button', { name: '儲存使用者' }));
    expect(await within(dialog).findByText('密碼至少 12 字元。')).toBeInTheDocument();
    expect(fetcher.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
    fireEvent.change(within(dialog).getByLabelText('姓名'), { target: { value: '新同仁' } });
    fireEvent.change(within(dialog).getByLabelText('Email'), {
      target: { value: 'new@example.test' },
    });
    fireEvent.change(within(dialog).getByLabelText('初始密碼'), {
      target: { value: 'ui-only-test-input' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '儲存使用者' }));
    expect(await screen.findByText('新同仁')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('修改自己的姓名後保留成功提示與篩選，更新 Header 不卸載管理頁', async () => {
    mockApi(admin);
    start('/users');
    await screen.findByText(admin.email);
    fireEvent.change(screen.getByLabelText('搜尋姓名或 Email'), {
      target: { value: '保留的搜尋條件' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: '編輯' })[0]!);
    const dialog = screen.getByRole('dialog', { name: '編輯使用者' });
    fireEvent.change(within(dialog).getByLabelText('姓名'), {
      target: { value: '更新後的管理員' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '儲存使用者' }));
    expect(await screen.findByText('使用者已儲存。')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('更新後的管理員')).toHaveLength(2));
    expect(screen.getByLabelText('搜尋姓名或 Email')).toHaveValue('保留的搜尋條件');
    expect(screen.getByText('使用者已儲存。')).toBeInTheDocument();
  });
  it('停用帳號需確認並送出 PATCH，不允許停用目前登入者', async () => {
    const { fetcher } = mockApi(admin);
    start('/users');
    await screen.findByText(member.email);
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]!).getByRole('button', { name: '停用' })).toBeDisabled();
    fireEvent.click(within(rows[2]!).getByRole('button', { name: '停用' }));
    const dialog = screen.getByRole('dialog', { name: '停用帳號' });
    expect(
      within(dialog).getByText('停用後，該帳號現有的所有 Session 將立即失效。'),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '確認' }));
    await waitFor(() =>
      expect(fetcher.mock.calls.find(([, options]) => options?.method === 'PATCH')?.[1]?.body).toBe(
        JSON.stringify({ isActive: false }),
      ),
    );
    expect(await screen.findByText('帳號已停用，既有 Session 已失效。')).toBeInTheDocument();
  });
});
