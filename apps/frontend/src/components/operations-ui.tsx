import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { CatalogDialog, CatalogPagination, CatalogNotice } from './catalog-ui';
import { opsGet, opsSend, row, rows, value, type Row } from '../api/operations';
export const messages: Record<string, string> = {
  PENDING: '待處理',
  PREPARING: '製作中',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  REQUESTED: '待審核',
  APPROVED: '已核准',
  ORDERED: '已訂購',
  PARTIAL: '部分收貨',
  RECEIVED: '收貨完成',
  REJECTED: '已拒絕',
  OPENING: '期初',
  IN: '進貨',
  ISSUE: '領料',
  WASTE: '耗損',
  COUNT: '盤點',
  COMPENSATION: '補償',
  SALE: '銷售耗用',
  RECEIPT: '採購收貨',
  DINE_IN: '內用',
  TAKEAWAY: '外帶',
  DELIVERY: '外送',
  CASH: '現金',
  CARD_RECORD: '刷卡紀錄',
  TRANSFER_RECORD: '轉帳紀錄',
};
export const display = (v: unknown) =>
  typeof v === 'boolean' ? (v ? '啟用' : '停用') : (messages[value(v)] ?? value(v));
export function useOps(path: string) {
  const [data, setData] = useState<unknown>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [version, reload] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setData(null);
    setLoading(true);
    setError('');
    opsGet(path, c.signal)
      .then((v) => {
        if (!c.signal.aborted) setData(v);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e instanceof Error ? e.message : '讀取失敗');
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [path, version]);
  return { data, error, loading, reload: () => reload((v) => v + 1) };
}
export function OperationsNav() {
  const { user } = useAuth();
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const listener = () => setSaved(true);
    window.addEventListener('erp:changed', listener);
    return () => window.removeEventListener('erp:changed', listener);
  }, []);
  const manager = ['ADMIN', 'MANAGER'].includes(user?.role ?? '');
  return (
    <>
      <CatalogNotice success={saved ? '操作已成功儲存。' : null} />
      <nav className="catalog-tabs">
        <Link to="/menu-items">一般餐點</Link>
        <Link to="/menu-configuration">套餐與客製化</Link>
        {user?.role !== 'CASHIER' && (
          <>
            <Link to="/ingredients">食材</Link>
            <Link to="/inventory">庫存異動</Link>
          </>
        )}
        <Link to="/orders">訂單</Link>
        {manager && (
          <>
            <Link to="/purchasing">採購</Link>
            <Link to="/staff">人事</Link>
            <Link to="/reports">報表</Link>
          </>
        )}
      </nav>
    </>
  );
}
export type Field = {
  key: string;
  name: string;
  type?: 'text' | 'money' | 'quantity' | 'integer' | 'datetime-local' | 'checkbox' | 'select';
  options?: { id: string; name: string }[];
  optional?: boolean;
  initial?: string | boolean;
};
export function CommandDialog({
  title,
  fields = [],
  initial = {},
  onClose,
  onSaved,
  submit,
  children,
  fingerprint = '',
}: {
  title: string;
  fields?: Field[];
  initial?: Row;
  onClose: () => void;
  onSaved: () => void;
  submit: (data: Row) => Promise<unknown>;
  children?: ReactNode;
  fingerprint?: string;
}) {
  const [form, setForm] = useState<Row>(() =>
      Object.fromEntries(
        fields.map((f) => [
          f.key,
          initial[f.key] ?? f.initial ?? (f.type === 'checkbox' ? true : ''),
        ]),
      ),
    ),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const receipt = useRef({ body: '', key: crypto.randomUUID() });
  return (
    <CatalogDialog title={title} onClose={onClose} busy={busy} wide>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          const data = { ...form };
          const displayedForm = { ...form };
          const nativeForm = new FormData(e.currentTarget);
          for (const f of fields) {
            const v = value(data[f.key]);
            if (f.type === 'money' && !/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(v)) {
              setError(`${f.name}須為非負金額，最多兩位小數。`);
              return;
            }
            if (f.type === 'quantity' && !/^(0|[1-9]\d{0,10})(\.\d{1,3})?$/.test(v)) {
              setError(`${f.name}須為非負數量，最多三位小數。`);
              return;
            }
            if (f.type === 'integer') {
              if (!/^\d+$/.test(v)) {
                setError(`${f.name}須為整數。`);
                return;
              }
              data[f.key] = Number(v);
            }
            if (f.type === 'datetime-local') {
              const displayed = nativeForm.get(f.key);
              const local = typeof displayed === 'string' ? displayed : v;
              displayedForm[f.key] = local;
              if (!local && !f.optional) {
                setError(`${f.name}必填。`);
                return;
              }
              if (local && Number.isNaN(new Date(local).getTime())) {
                setError(`${f.name}格式不正確。`);
                return;
              }
              data[f.key] = local ? new Date(local).toISOString() : null;
            }
          }
          setForm(displayedForm);
          const body = JSON.stringify(data) + fingerprint;
          if (receipt.current.body !== body) receipt.current = { body, key: crypto.randomUUID() };
          setBusy(true);
          try {
            await submit({ ...data, requestKey: receipt.current.key });
            window.dispatchEvent(new Event('erp:changed'));
            onSaved();
            onClose();
          } catch (err) {
            setError(err instanceof Error ? err.message : '儲存失敗');
          } finally {
            setBusy(false);
          }
        }}
      >
        <CatalogNotice error={error} />
        <div className="ops-form">
          {fields.map((f) => (
            <label key={f.key}>
              {f.name}
              {f.type === 'checkbox' ? (
                <input
                  type="checkbox"
                  name={f.key}
                  checked={Boolean(form[f.key])}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })}
                />
              ) : f.type === 'select' ? (
                <select
                  name={f.key}
                  required={!f.optional}
                  value={value(form[f.key])}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                >
                  <option value="">請選擇</option>
                  {f.options?.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  name={f.key}
                  type={f.type === 'datetime-local' ? 'datetime-local' : 'text'}
                  inputMode={
                    ['money', 'quantity', 'integer'].includes(f.type ?? '') ? 'decimal' : undefined
                  }
                  required={!f.optional}
                  maxLength={
                    f.key === 'reason' || f.key === 'note'
                      ? 500
                      : f.key === 'name'
                        ? 100
                        : f.key === 'code'
                          ? 64
                          : 200
                  }
                  value={value(form[f.key])}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
              )}
            </label>
          ))}
        </div>
        {children}
        <footer className="dialog-actions">
          <button type="button" className="button button-white" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button className="button button-dark" disabled={busy}>
            {busy ? '儲存中…' : '確認儲存'}
          </button>
        </footer>
      </form>
    </CatalogDialog>
  );
}
export function ResourceTable({
  path,
  columns,
  actions,
  title,
  toolbar,
}: {
  path: string;
  columns: { name: string; render: (r: Row) => ReactNode }[];
  actions?: (r: Row, reload: () => void) => ReactNode;
  title: string;
  toolbar?: ReactNode;
}) {
  const [page, setPage] = useState(1),
    [q, setQ] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [status, setStatus] = useState('');
  const filtered = ['/orders', '/purchases', '/stock-movements'].includes(path);
  const states =
    path === '/orders'
      ? ['PENDING', 'PREPARING', 'COMPLETED', 'CANCELLED']
      : path === '/purchases'
        ? ['REQUESTED', 'APPROVED', 'ORDERED', 'PARTIAL', 'RECEIVED', 'CANCELLED']
        : [];
  const state = useOps(
      `${path}?page=${page}&q=${encodeURIComponent(q)}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}${status ? `&status=${status}` : ''}`,
    ),
    data = state.data ? row(state.data) : {},
    items = rows(data.items);
  return (
    <section className="panel ops-panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        {toolbar}
      </div>
      <div className="catalog-toolbar">
        <input
          aria-label={`搜尋${title}`}
          placeholder="搜尋名稱或備註"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <button className="button button-white" onClick={state.reload}>
          重新整理
        </button>
      </div>
      <CatalogNotice error={state.error} />
      {filtered && (
        <div className="ops-tabs">
          <label>
            開始日期{' '}
            <input
              aria-label={`${title}開始日期`}
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            結束日期{' '}
            <input
              aria-label={`${title}結束日期`}
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
            />
          </label>
          {states.length > 0 && (
            <select
              aria-label={`${title}狀態`}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">全部狀態</option>
              {states.map((s) => (
                <option key={s} value={s}>
                  {display(s)}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      {state.loading ? (
        <p role="status">載入中…</p>
      ) : !items.length ? (
        <p className="empty-state">目前沒有資料</p>
      ) : (
        <div className="table-scroll">
          <table className="users-table catalog-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.name}>{c.name}</th>
                ))}
                {actions && <th>操作</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((r, i) => (
                <tr key={value(r.id) || String(i)}>
                  {columns.map((c) => (
                    <td key={c.name}>{c.render(r)}</td>
                  ))}
                  {actions && (
                    <td>
                      <div className="ops-actions">{actions(r, state.reload)}</div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <CatalogPagination
        page={page}
        total={Number(data.total ?? 0)}
        onPage={setPage}
        loading={state.loading}
      />
    </section>
  );
}
export function SimpleCommand({
  path,
  body,
  title,
  onSaved,
  method = 'POST',
}: {
  path: string;
  body: Row;
  title: string;
  onSaved: () => void;
  method?: 'POST' | 'PUT';
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="button button-white" onClick={() => setOpen(true)}>
        {title}
      </button>
      {open && (
        <CommandDialog
          title={title}
          onClose={() => setOpen(false)}
          onSaved={onSaved}
          submit={(v) => opsSend(path, { ...body, ...v }, method)}
        >
          <p>確認執行「{title}」？此操作將保存至資料庫。</p>
        </CommandDialog>
      )}
    </>
  );
}
