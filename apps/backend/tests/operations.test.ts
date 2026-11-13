import { describe, it, expect } from 'vitest';
import { schemas, listQuery } from '../src/modules/operations/validation.js';
import { dateWindow } from '../src/modules/operations/reports.service.js';
import { timeRange } from '../src/modules/operations/staff.service.js';
const id = '12345678-1234-4234-8234-123456789012';
describe('ERP輸入及日期規則', () => {
  it.each(['-1', '1e3', '01', '0.1234', 1])('拒絕無效庫存數量 %s', (quantity) => {
    expect(
      schemas.stock.safeParse({
        requestKey: id,
        ingredientId: id,
        type: 'IN',
        quantity,
        reason: '進貨',
      }).success,
    ).toBe(false);
  });
  it('不接受用戶提交庫存前後量', () => {
    expect(
      schemas.stock.safeParse({
        requestKey: id,
        ingredientId: id,
        type: 'IN',
        quantity: '1',
        reason: '進貨',
        after: '1000',
      }).success,
    ).toBe(false);
  });
  it('選項群組上下限須一致', () => {
    expect(
      schemas.group.safeParse({
        requestKey: id,
        menuItemId: id,
        name: '測試',
        minSelect: 2,
        maxSelect: 1,
      }).success,
    ).toBe(false);
  });
  it('訂單明細與請求識別碼必填', () => {
    expect(
      schemas.order.safeParse({
        type: 'DINE_IN',
        reference: '1',
        discount: '0',
        serviceFee: '0',
        lines: [],
      }).success,
    ).toBe(false);
  });
  it('台北整日邊界包含結束當日', () => {
    const range = dateWindow(listQuery.parse({ from: '2026-11-01', to: '2026-11-01' }));
    expect(range.start.toISOString()).toBe('2026-10-31T16:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-11-01T16:00:00.000Z');
  });
  it('拒絕超過366日與反向日期', () => {
    expect(() => dateWindow(listQuery.parse({ from: '2020-01-01', to: '2026-01-01' }))).toThrow();
    expect(() => timeRange('2026-11-12T09:00:00Z', '2026-11-12T09:00:00Z')).toThrow();
  });
});
