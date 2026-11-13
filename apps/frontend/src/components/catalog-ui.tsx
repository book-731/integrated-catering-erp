import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { X, Search, RefreshCw } from 'lucide-react';
export function CatalogDialog({
  title,
  onClose,
  busy = false,
  wide = false,
  children,
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`erp-dialog ${wide ? 'recipe-dialog' : ''}`}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="關閉對話框"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function CatalogField({
  label,
  id,
  error,
  children,
}: {
  label: string;
  id: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="catalog-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
export function CatalogNotice({
  error,
  success,
}: {
  error?: string | null;
  success?: string | null;
}) {
  return (
    <>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="success-notice" role="status">
          {success}
        </p>
      )}
    </>
  );
}
export function CatalogPagination({
  page,
  total,
  loading,
  onPage,
  pageSize = 20,
}: {
  page: number;
  total: number;
  loading: boolean;
  onPage: (page: number) => void;
  pageSize?: number;
}) {
  return (
    <div className="pagination">
      <span>
        共 {total} 筆 · 第 {page} 頁
      </span>
      <div>
        <button
          className="button button-white"
          disabled={loading || page <= 1}
          onClick={() => onPage(page - 1)}
        >
          上一頁
        </button>
        <button
          className="button button-white"
          disabled={loading || page * pageSize >= total}
          onClick={() => onPage(page + 1)}
        >
          下一頁
        </button>
      </div>
    </div>
  );
}
export function CatalogSearch({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <label className="search-input">
      <Search size={17} />
      <input
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={100}
      />
    </label>
  );
}
export function ActiveFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <select
      aria-label="篩選啟用狀態"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">全部狀態</option>
      <option value="true">啟用中</option>
      <option value="false">已停用</option>
    </select>
  );
}
export function ReloadButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="button button-white"
      aria-label="重新載入資料"
      onClick={onClick}
    >
      <RefreshCw size={16} />
    </button>
  );
}
export function CatalogTable({
  headers,
  loading,
  error,
  empty,
  onRetry,
  children,
}: {
  headers: string[];
  loading: boolean;
  error: string | null;
  empty: boolean;
  onRetry: () => void;
  children: ReactNode;
}) {
  return error ? (
    <div className="table-state" role="alert">
      <p>{error}</p>
      <button className="button button-white" onClick={onRetry}>
        重試
      </button>
    </div>
  ) : (
    <div className="table-scroll">
      <table className="users-table catalog-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={headers.length} className="table-state" role="status">
                正在載入資料…
              </td>
            </tr>
          ) : empty ? (
            <tr>
              <td colSpan={headers.length} className="table-state">
                沒有符合條件的資料。
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}
export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span className={`pill ${active ? 'pill-green' : 'pill-gray'}`}>
      {active ? '啟用中' : '已停用'}
    </span>
  );
}
export function FormActions({
  busy,
  onClose,
  submitDisabled = false,
}: {
  busy: boolean;
  onClose: () => void;
  submitDisabled?: boolean;
}) {
  return (
    <div className="dialog-actions">
      <button type="button" className="button button-white" disabled={busy} onClick={onClose}>
        取消
      </button>
      <button type="submit" className="button button-dark" disabled={busy || submitDisabled}>
        {busy ? '儲存中…' : '儲存'}
      </button>
    </div>
  );
}
export function CatalogTabs({
  manage,
  ingredients = manage,
}: {
  manage: boolean;
  ingredients?: boolean;
}) {
  return (
    <nav className="catalog-tabs" aria-label="食材與菜單導覽">
      {ingredients && <NavLink to="/ingredients">食材管理</NavLink>}
      <NavLink to="/menu-categories">菜單分類</NavLink>
      <NavLink to="/menu-items">餐點與配方</NavLink>
      <NavLink to="/menu-configuration">套餐與客製化</NavLink>
      {ingredients && <NavLink to="/inventory">庫存異動</NavLink>}
    </nav>
  );
}
export function CatalogStatusDialog({
  name,
  active,
  onClose,
  onSave,
  description,
}: {
  name: string;
  active: boolean;
  onClose: () => void;
  onSave: () => Promise<void>;
  description: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  return (
    <CatalogDialog title={active ? '停用資料' : '啟用資料'} busy={busy} onClose={onClose}>
      <div className="user-form">
        <p>
          確定要{active ? '停用' : '啟用'}「{name}」？
        </p>
        <p className="form-help">{description}</p>
        <CatalogNotice error={error} />
        <div className="dialog-actions">
          <button className="button button-white" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button
            className="button button-dark"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError(null);
              void onSave()
                .catch((failure) =>
                  setError(failure instanceof Error ? failure.message : '更新失敗。'),
                )
                .finally(() => setBusy(false));
            }}
          >
            {busy ? '處理中…' : '確認'}
          </button>
        </div>
      </div>
    </CatalogDialog>
  );
}
