import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import {
  getCategories,
  createCategory,
  updateCategory,
  type Category,
  type CategoryInput,
  type CatalogQuery,
} from '../api/catalog';
import { useAuth } from '../auth/auth-context';
import { useCatalogList } from '../hooks/use-catalog-list';
import {
  canManageCatalog,
  canReadIngredients,
  categoryFormSchema,
  fieldErrors,
} from '../config/catalog';
import {
  CatalogDialog,
  CatalogField,
  CatalogNotice,
  CatalogPagination,
  CatalogSearch,
  ActiveFilter,
  ReloadButton,
  CatalogTable,
  ActiveBadge,
  FormActions,
  CatalogStatusDialog,
  CatalogTabs,
} from '../components/catalog-ui';
function CategoryForm({
  item,
  onClose,
  onSaved,
}: {
  item: Category | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState<CategoryInput>({
    name: item?.name ?? '',
    isActive: item?.isActive ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({}),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const parsed = categoryFormSchema.safeParse(value);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      if (item) await updateCategory(item.id, parsed.data);
      else await createCategory(parsed.data);
      onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '儲存失敗。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <CatalogDialog title={item ? '編輯分類' : '新增分類'} busy={busy} onClose={onClose}>
      <form className="user-form catalog-form" onSubmit={(event) => void submit(event)} noValidate>
        <fieldset disabled={busy}>
          <CatalogField id="category-name" label="分類名稱" error={errors.name}>
            <input
              id="category-name"
              value={value.name}
              maxLength={100}
              onChange={(event) => setValue({ ...value, name: event.target.value })}
              aria-invalid={!!errors.name}
            />
          </CatalogField>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={value.isActive}
              onChange={(event) => setValue({ ...value, isActive: event.target.checked })}
            />
            啟用分類
          </label>
          <p className="form-help">分類名稱不得重複。停用保留所屬餐點，不提供硬刪除。</p>
          <CatalogNotice error={error} />
          <FormActions busy={busy} onClose={onClose} />
        </fieldset>
      </form>
    </CatalogDialog>
  );
}
export function CategoriesPage() {
  const { user } = useAuth();
  const manage = canManageCatalog(user?.role);
  const [q, setQ] = useState(''),
    [active, setActive] = useState('');
  const [query, setQuery] = useState<CatalogQuery>({ q: '', isActive: '', page: 1 });
  const list = useCatalogList(getCategories, query);
  const [editor, setEditor] = useState<{ item: Category | null } | null>(null),
    [target, setTarget] = useState<Category | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">MENU CATEGORIES</p>
          <h1>菜單分類</h1>
          <p className="page-description">整理餐點分類，保留每一筆既有關聯。</p>
        </div>
        {manage && (
          <button
            className="button button-dark"
            onClick={() => {
              setNotice(null);
              setEditor({ item: null });
            }}
          >
            <Plus size={16} />
            新增分類
          </button>
        )}
      </section>
      <CatalogTabs manage={manage} ingredients={canReadIngredients(user?.role)} />
      {!manage && <p className="catalog-readonly">目前角色為唯讀，可查詢分類與餐點。</p>}
      <CatalogNotice success={notice} />
      <section className="panel">
        <form
          className="users-filters"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery({ q, isActive: active, page: 1 });
          }}
        >
          <CatalogSearch label="搜尋分類名稱" value={q} onChange={setQ} />
          <ActiveFilter value={active} onChange={setActive} />
          <button className="button button-white" type="submit">
            套用篩選
          </button>
          <ReloadButton onClick={list.reload} />
        </form>
        <CatalogTable
          headers={['分類名稱', '餐點數', '狀態', ...(manage ? ['操作'] : [])]}
          loading={list.loading}
          error={list.error}
          empty={!list.items.length}
          onRetry={list.reload}
        >
          {list.items.map((item) => (
            <tr key={item.id}>
              <td>
                <strong>{item.name}</strong>
              </td>
              <td>{item.menuItemCount}</td>
              <td>
                <ActiveBadge active={item.isActive} />
              </td>
              {manage && (
                <td>
                  <div className="row-actions">
                    <button onClick={() => setEditor({ item })}>編輯</button>
                    <button onClick={() => setTarget(item)}>
                      {item.isActive ? '停用' : '啟用'}
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </CatalogTable>
        <CatalogPagination
          page={query.page}
          total={list.total}
          loading={list.loading}
          onPage={(page) => setQuery({ ...query, page })}
        />
      </section>
      {editor && (
        <CategoryForm
          item={editor.item}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            setNotice('分類已儲存。');
            list.reload();
          }}
        />
      )}
      {target && (
        <CatalogStatusDialog
          name={target.name}
          active={target.isActive}
          description="既有餐點保留；停用分類不能被新餐點選用，不會連帶刪除餐點。"
          onClose={() => setTarget(null)}
          onSave={async () => {
            await updateCategory(target.id, { isActive: !target.isActive });
            setNotice(target.isActive ? '分類已停用，所屬餐點保留。' : '分類已啟用。');
            setTarget(null);
            list.reload();
          }}
        />
      )}
    </>
  );
}
