import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Plus, Search, X, RefreshCw, ShieldCheck } from 'lucide-react';
import { z } from 'zod';
import type { User } from '../api/auth';
import { createUser, getUsers, updateUser, type UserInput, type UsersQuery } from '../api/users';
import { roles, roleLabels, type Role } from '../config/roles';
import { useAuth } from '../auth/auth-context';

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
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
      className="erp-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-label={title}
    >
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="關閉對話框" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function UserForm({
  user,
  currentUserId,
  onClose,
  onSaved,
}: {
  user: User | null;
  currentUserId: string;
  onClose: () => void;
  onSaved: (user: User) => Promise<void>;
}) {
  const [name, setName] = useState(user?.displayName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'CASHIER');
  const [active, setActive] = useState(user?.isActive ?? true);
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const schema = z.object({
      displayName: z.string().trim().min(1, '請輸入姓名。').max(100),
      email: z.email('請輸入有效 Email。').max(254),
      password: user
        ? z
            .string()
            .refine(
              (value) => !value || (value.length >= 12 && value.length <= 128),
              '新密碼需為 12–128 字元。',
            )
        : z.string().min(12, '密碼至少 12 字元。').max(128),
    });
    const parsed = schema.safeParse({ displayName: name, email: email.trim(), password });
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
        ),
      );
      return;
    }
    setErrors({});
    setSaving(true);
    const input: UserInput = {
      displayName: parsed.data.displayName,
      email: parsed.data.email.toLowerCase(),
      role,
      isActive: active,
      ...(password ? { password } : {}),
    };
    try {
      const saved = user ? await updateUser(user.id, input) : await createUser(input);
      setPassword('');
      await onSaved(saved);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '儲存失敗。');
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      title={user ? '編輯使用者' : '新增使用者'}
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <form className="user-form" onSubmit={(event) => void submit(event)} noValidate>
        <label htmlFor="user-name">姓名</label>
        <input
          id="user-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={100}
          disabled={saving}
          aria-invalid={Boolean(errors.displayName)}
        />
        {errors.displayName && <p className="field-error">{errors.displayName}</p>}
        <label htmlFor="user-email">Email</label>
        <input
          id="user-email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          maxLength={254}
          disabled={saving}
          aria-invalid={Boolean(errors.email)}
        />
        {errors.email && <p className="field-error">{errors.email}</p>}
        <label htmlFor="user-role">角色</label>
        <select
          id="user-role"
          value={role}
          onChange={(event) => setRole(event.target.value as Role)}
          disabled={saving || user?.id === currentUserId}
        >
          {roles.map((value) => (
            <option key={value} value={value}>
              {roleLabels[value]}（{value}）
            </option>
          ))}
        </select>
        <label htmlFor="user-password">{user ? '新密碼（留空則保留原密碼）' : '初始密碼'}</label>
        <input
          id="user-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          maxLength={128}
          disabled={saving}
          aria-invalid={Boolean(errors.password)}
        />
        {errors.password && <p className="field-error">{errors.password}</p>}
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
            disabled={saving || user?.id === currentUserId}
          />
          啟用帳號
        </label>
        <p className="form-help">
          變更 Email、密碼、角色或啟用狀態會撤銷該帳號的所有登入 Session。
        </p>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="button button-white" disabled={saving} onClick={onClose}>
            取消
          </button>
          <button type="submit" className="button button-dark" disabled={saving}>
            {saving ? '儲存中…' : '儲存使用者'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function UsersPage() {
  const auth = useAuth();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [isActive, setIsActive] = useState('');
  const [query, setQuery] = useState<UsersQuery>({ q: '', role: '', isActive: '', page: 1 });
  const [items, setItems] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [editor, setEditor] = useState<{ user: User | null } | null>(null);
  const [statusTarget, setStatusTarget] = useState<User | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void getUsers(query, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) {
          setItems(result.items);
          setTotal(result.total);
          setLoading(false);
        }
      },
      (failure) => {
        if (!controller.signal.aborted) {
          setError(failure instanceof Error ? failure.message : '使用者載入失敗。');
          setLoading(false);
        }
      },
    );
    return () => controller.abort();
  }, [query, refresh]);
  async function saved(user: User) {
    setEditor(null);
    setNotice('使用者已儲存。');
    setRefresh((value) => value + 1);
    if (user.id === auth.user?.id) await auth.refresh(true);
  }
  async function toggleStatus() {
    if (!statusTarget) return;
    setStatusBusy(true);
    setStatusError(null);
    try {
      await updateUser(statusTarget.id, { isActive: !statusTarget.isActive });
      setNotice(statusTarget.isActive ? '帳號已停用，既有 Session 已失效。' : '帳號已啟用。');
      setStatusTarget(null);
      setRefresh((value) => value + 1);
    } catch (failure) {
      setStatusError(failure instanceof Error ? failure.message : '狀態更新失敗。');
    } finally {
      setStatusBusy(false);
    }
  }
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">IDENTITY & ACCESS</p>
          <h1>使用者與權限</h1>
          <p className="page-description">管理團隊帳號、角色與存取狀態。</p>
        </div>
        <button
          className="button button-dark"
          onClick={() => {
            setNotice(null);
            setEditor({ user: null });
          }}
        >
          <Plus size={16} />
          新增使用者
        </button>
      </section>
      <div className="users-security-note">
        <ShieldCheck size={18} />
        <span>僅管理員可管理帳號。停用與敏感資料變更會撤銷既有 Session。</span>
      </div>
      {notice && (
        <p className="success-notice" role="status">
          {notice}
        </p>
      )}
      <section className="panel">
        <form
          className="users-filters"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery({ q, role, isActive, page: 1 });
          }}
        >
          <label className="search-input">
            <Search size={17} />
            <input
              aria-label="搜尋姓名或 Email"
              placeholder="搜尋姓名或 Email"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              maxLength={100}
            />
          </label>
          <select
            aria-label="篩選角色"
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            <option value="">全部角色</option>
            {roles.map((value) => (
              <option key={value} value={value}>
                {roleLabels[value]}
              </option>
            ))}
          </select>
          <select
            aria-label="篩選帳號狀態"
            value={isActive}
            onChange={(event) => setIsActive(event.target.value)}
          >
            <option value="">全部狀態</option>
            <option value="true">啟用中</option>
            <option value="false">已停用</option>
          </select>
          <button type="submit" className="button button-white">
            套用篩選
          </button>
          <button
            type="button"
            className="button button-white"
            aria-label="重新載入使用者"
            onClick={() => setRefresh((value) => value + 1)}
          >
            <RefreshCw size={15} />
          </button>
        </form>
        {error ? (
          <div className="table-state" role="alert">
            <p>{error}</p>
            <button
              className="button button-white"
              onClick={() => setRefresh((value) => value + 1)}
            >
              重試
            </button>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="users-table">
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>Email</th>
                  <th>角色</th>
                  <th>狀態</th>
                  <th>建立日期</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="table-state" role="status">
                      正在載入使用者…
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="table-state">
                      沒有符合條件的使用者。
                    </td>
                  </tr>
                ) : (
                  items.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <strong>{user.displayName}</strong>
                        {user.id === auth.user?.id && <small className="you-tag">目前登入</small>}
                      </td>
                      <td>{user.email}</td>
                      <td>{roleLabels[user.role]}</td>
                      <td>
                        <span className={`pill ${user.isActive ? 'pill-green' : 'pill-gray'}`}>
                          {user.isActive ? '啟用中' : '已停用'}
                        </span>
                      </td>
                      <td>
                        {new Date(user.createdAt).toLocaleDateString('zh-TW', {
                          timeZone: 'Asia/Taipei',
                        })}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button onClick={() => setEditor({ user })}>編輯</button>
                          <button
                            disabled={user.id === auth.user?.id}
                            onClick={() => {
                              setStatusError(null);
                              setStatusTarget(user);
                            }}
                          >
                            {user.isActive ? '停用' : '啟用'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <span>
            共 {total} 位使用者 · 第 {query.page} 頁
          </span>
          <div>
            <button
              className="button button-white"
              disabled={loading || query.page <= 1}
              onClick={() => setQuery((value) => ({ ...value, page: value.page - 1 }))}
            >
              上一頁
            </button>
            <button
              className="button button-white"
              disabled={loading || query.page * 20 >= total}
              onClick={() => setQuery((value) => ({ ...value, page: value.page + 1 }))}
            >
              下一頁
            </button>
          </div>
        </div>
      </section>
      {editor && (
        <UserForm
          key={editor.user?.id ?? 'new'}
          user={editor.user}
          currentUserId={auth.user?.id ?? ''}
          onClose={() => setEditor(null)}
          onSaved={saved}
        />
      )}{' '}
      {statusTarget && (
        <Modal
          title={statusTarget.isActive ? '停用帳號' : '啟用帳號'}
          onClose={() => {
            if (!statusBusy) setStatusTarget(null);
          }}
        >
          <div className="user-form">
            <p>
              確定要{statusTarget.isActive ? '停用' : '啟用'}「{statusTarget.displayName}」？
            </p>
            {statusTarget.isActive && (
              <p className="form-help">停用後，該帳號現有的所有 Session 將立即失效。</p>
            )}
            {statusError && (
              <p className="form-error" role="alert">
                {statusError}
              </p>
            )}
            <div className="dialog-actions">
              <button
                className="button button-white"
                disabled={statusBusy}
                onClick={() => setStatusTarget(null)}
              >
                取消
              </button>
              <button
                className="button button-dark"
                disabled={statusBusy}
                onClick={() => void toggleStatus()}
              >
                {statusBusy ? '處理中…' : '確認'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
