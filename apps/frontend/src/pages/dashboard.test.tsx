import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from './dashboard';
import { ModulePlaceholder } from './module-placeholder';
const health = {
  success: true,
  data: {
    status: 'ok',
    service: 'restaurant-erp-api',
    version: '0.1.0',
    timestamp: '2026-11-10T06:00:00.000Z',
    database: { status: 'up', latencyMs: 2.5 },
  },
  requestId: 'test-request',
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const renderDashboard = () =>
  render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
afterEach(() => vi.unstubAllGlobals());

describe('真實 API 的介面契約（僅測試中替換 fetch）', () => {
  it('顯示 loading，成功後呈現資料庫查詢耗時並支援重新檢查', async () => {
    let resolveRequest: (value: Response) => void = () => {};
    const fetcher = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveRequest = resolve;
          }),
      )
      .mockResolvedValue(response(health));
    vi.stubGlobal('fetch', fetcher);
    renderDashboard();
    expect(screen.getByText('正在檢查系統連線…')).toBeInTheDocument();
    await act(async () => resolveRequest(response(health)));
    expect(await screen.findByText('所有服務連線正常')).toBeInTheDocument();
    expect(screen.getByText('查詢耗時 2.5 ms')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新檢查' }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('所有服務連線正常')).toBeInTheDocument();
  });
  it('503 顯示資料庫異常，保留後端已回應的狀態與請求編號', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(
          {
            success: false,
            error: { code: 'DATABASE_UNAVAILABLE', message: 'API 已啟動，但無法連線至資料庫。' },
            requestId: 'failure-request',
          },
          503,
        ),
      ),
    );
    renderDashboard();
    expect(await screen.findByText('API 已啟動，但無法連線至資料庫。')).toBeInTheDocument();
    expect(screen.getByText('服務已回應')).toBeInTheDocument();
    expect(screen.getByText('連線失敗')).toBeInTheDocument();
    expect(screen.queryByText('所有服務連線正常')).not.toBeInTheDocument();
  });
  it('連線中斷時顯示可操作的錯誤狀態', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    renderDashboard();
    expect(await screen.findByText('無法連線至後端，請確認 API 服務已啟動。')).toBeInTheDocument();
    expect(screen.getByText('尚未確認')).toBeInTheDocument();
  });
  it('不接受格式錯誤的成功回應', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ success: true, data: {} })));
    renderDashboard();
    expect(
      await screen.findByText('API 回應格式不符合預期，請確認前後端版本。'),
    ).toBeInTheDocument();
  });
  it('不存在的模組提供空白狀態與返回連結', () => {
    render(
      <MemoryRouter>
        <ModulePlaceholder />
      </MemoryRouter>,
    );
    expect(screen.getByText('此頁面不存在')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回系統總覽' })).toHaveAttribute('href', '/');
  });
});
