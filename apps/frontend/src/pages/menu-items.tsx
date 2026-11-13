import { useState, type FormEvent } from 'react';
import { Plus, ImageOff, BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  getMenuItems,
  createMenuItem,
  updateMenuItem,
  type MenuItem,
  type CatalogQuery,
} from '../api/catalog';
import { useAuth } from '../auth/auth-context';
import { useCatalogList, useCategoryOptions } from '../hooks/use-catalog-list';
import {
  canManageCatalog,
  canReadRecipe,
  canReadIngredients,
  menuFormSchema,
  fieldErrors,
} from '../config/catalog';
import { RecipeEditor } from '../components/recipe-editor';
import { IngredientAvailabilityDialog } from '../components/ingredient-availability';
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
type Options = ReturnType<typeof useCategoryOptions>;
function MealImage({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  return url && !failed ? (
    <img
      className="meal-thumbnail"
      src={url}
      alt={name}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  ) : (
    <span className="meal-thumbnail meal-thumbnail-empty" aria-label="未提供可用圖片">
      <ImageOff size={18} />
    </span>
  );
}
function MenuForm({
  item,
  options,
  onClose,
  onSaved,
}: {
  item: MenuItem | null;
  options: Options;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState({
    name: item?.name ?? '',
    categoryId: item?.categoryId ?? '',
    price: item?.price ?? '0.00',
    imageUrl: item?.imageUrl ?? '',
    isActive: item?.isActive ?? true,
    isAvailable: item?.isAvailable ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({}),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const parsed = menuFormSchema.safeParse(value);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    if (options.loading || options.error) return;
    setErrors({});
    setBusy(true);
    const input = { ...parsed.data, imageUrl: parsed.data.imageUrl || null };
    try {
      if (item) await updateMenuItem(item.id, input);
      else await createMenuItem(input);
      onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '儲存失敗。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <CatalogDialog title={item ? '編輯餐點' : '新增餐點'} busy={busy} onClose={onClose}>
      <form className="user-form catalog-form" onSubmit={(event) => void submit(event)} noValidate>
        <fieldset disabled={busy}>
          <CatalogField id="menu-name" label="餐點名稱" error={errors.name}>
            <input
              id="menu-name"
              value={value.name}
              maxLength={100}
              onChange={(event) => setValue({ ...value, name: event.target.value })}
              aria-invalid={!!errors.name}
            />
          </CatalogField>
          <CatalogField id="menu-category" label="所屬分類" error={errors.categoryId}>
            <select
              id="menu-category"
              value={value.categoryId}
              onChange={(event) => setValue({ ...value, categoryId: event.target.value })}
              disabled={options.loading || !!options.error}
              aria-invalid={!!errors.categoryId}
            >
              <option value="">{options.loading ? '分類載入中…' : '請選擇啟用分類'}</option>
              {options.items.map((category) => (
                <option
                  key={category.id}
                  value={category.id}
                  disabled={!category.isActive && category.id !== item?.categoryId}
                >
                  {category.name}
                  {category.isActive ? '' : '（已停用）'}
                </option>
              ))}
            </select>
          </CatalogField>
          {options.error && (
            <div role="alert">
              <p>{options.error}</p>
              <button className="button button-white" type="button" onClick={options.reload}>
                重試分類查詢
              </button>
            </div>
          )}
          {!options.loading &&
            !options.error &&
            !options.items.some((category) => category.isActive) && (
              <p className="form-help">
                尚無啟用分類，請先至 <Link to="/menu-categories">菜單分類</Link> 建立或啟用。
              </p>
            )}
          <CatalogField id="menu-price" label="價格" error={errors.price}>
            <input
              id="menu-price"
              inputMode="decimal"
              value={value.price}
              onChange={(event) => setValue({ ...value, price: event.target.value })}
              aria-invalid={!!errors.price}
            />
          </CatalogField>
          <CatalogField id="menu-image" label="圖片 URL（選填）" error={errors.imageUrl}>
            <input
              id="menu-image"
              type="url"
              value={value.imageUrl}
              maxLength={2048}
              placeholder="https://…"
              onChange={(event) => setValue({ ...value, imageUrl: event.target.value })}
              aria-invalid={!!errors.imageUrl}
            />
          </CatalogField>
          <p className="form-help">
            價格最多 2 位小數。圖片僅儲存 HTTP(S) URL，本階段不提供圖片上傳。
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={value.isActive}
              onChange={(event) => setValue({ ...value, isActive: event.target.checked })}
            />
            啟用餐點
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={value.isAvailable}
              onChange={(event) => setValue({ ...value, isAvailable: event.target.checked })}
            />
            供應中
          </label>
          <CatalogNotice error={error} />
          <FormActions
            busy={busy}
            submitDisabled={options.loading || !!options.error}
            onClose={onClose}
          />
        </fieldset>
      </form>
    </CatalogDialog>
  );
}
export function MenuItemsPage() {
  const { user } = useAuth(),
    manage = canManageCatalog(user?.role),
    readRecipe = canReadRecipe(user?.role);
  const [q, setQ] = useState(''),
    [active, setActive] = useState(''),
    [categoryId, setCategoryId] = useState(''),
    [available, setAvailable] = useState('');
  const [query, setQuery] = useState<CatalogQuery>({ q: '', isActive: '', page: 1 });
  const list = useCatalogList(getMenuItems, query),
    options = useCategoryOptions();
  const [editor, setEditor] = useState<{ item: MenuItem | null } | null>(null),
    [target, setTarget] = useState<MenuItem | null>(null),
    [recipe, setRecipe] = useState<MenuItem | null>(null),
    [availability, setAvailability] = useState<MenuItem | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">MENU & RECIPES</p>
          <h1>餐點與配方</h1>
          <p className="page-description">管理一般餐點、供應設定與每份食材用量。</p>
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
            新增餐點
          </button>
        )}
      </section>
      <CatalogTabs manage={manage} ingredients={canReadIngredients(user?.role)} />
      {!manage && (
        <p className="catalog-readonly">
          目前角色為唯讀{readRecipe ? '，可查看餐點與配方。' : '，可查看菜單；配方未授權。'}
        </p>
      )}
      <CatalogNotice success={notice} />
      <section className="panel">
        <form
          className="users-filters catalog-filters"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery({ q, isActive: active, categoryId, isAvailable: available, page: 1 });
          }}
        >
          <CatalogSearch label="搜尋餐點名稱" value={q} onChange={setQ} />
          <ActiveFilter value={active} onChange={setActive} />
          <select
            aria-label="篩選菜單分類"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            disabled={options.loading}
          >
            <option value="">{options.loading ? '分類載入中…' : '全部分類'}</option>
            {options.items.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
                {category.isActive ? '' : '（已停用）'}
              </option>
            ))}
          </select>
          <select
            aria-label="篩選供應狀態"
            value={available}
            onChange={(event) => setAvailable(event.target.value)}
          >
            <option value="">全部供應設定</option>
            <option value="true">供應中</option>
            <option value="false">暫停供應</option>
          </select>
          <button className="button button-white" type="submit">
            套用篩選
          </button>
          <ReloadButton onClick={list.reload} />
        </form>
        {options.error && (
          <div className="catalog-inline-error" role="alert">
            分類載入失敗：{options.error}
            <button className="button button-white" onClick={options.reload}>
              重試分類
            </button>
          </div>
        )}
        <CatalogTable
          headers={[
            '餐點',
            '分類',
            '價格',
            '供應設定',
            '狀態',
            '配方',
            ...(manage ? ['操作'] : []),
          ]}
          loading={list.loading}
          error={list.error}
          empty={!list.items.length}
          onRetry={list.reload}
        >
          {list.items.map((item) => (
            <tr key={item.id}>
              <td>
                <div className="meal-cell">
                  <MealImage key={item.imageUrl ?? 'none'} url={item.imageUrl} name={item.name} />
                  <strong>{item.name}</strong>
                </div>
              </td>
              <td>
                {item.category.name}
                {!item.category.isActive && <small className="stock-warning">分類已停用</small>}
              </td>
              <td className="decimal-value">{item.price}</td>
              <td>
                <span className={`pill ${item.isAvailable ? 'pill-green' : 'pill-gray'}`}>
                  {item.isAvailable ? '供應中' : '暫停供應'}
                </span>
              </td>
              <td>
                <ActiveBadge active={item.isActive} />
              </td>
              <td>
                {readRecipe ? (
                  <div className="recipe-links">
                    <button className="recipe-link" onClick={() => setRecipe(item)}>
                      <BookOpen size={15} />
                      {manage ? '編輯配方' : '查看配方'}
                      <small>{item.recipeCount} 項</small>
                    </button>
                    <button className="recipe-link" onClick={() => setAvailability(item)}>
                      檢查食材
                    </button>
                  </div>
                ) : (
                  <span className="muted">未授權</span>
                )}
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
      <p className="catalog-footnote">
        停用餐點保留資料與配方。套餐、複雜客製化、訂單及庫存扣除尚未開發。
      </p>
      {editor && (
        <MenuForm
          item={editor.item}
          options={options}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            setNotice('餐點已儲存。');
            list.reload();
          }}
        />
      )}
      {target && (
        <CatalogStatusDialog
          name={target.name}
          active={target.isActive}
          description="停用餐點保留既有配方與資料，不能編輯停用餐點的配方。"
          onClose={() => setTarget(null)}
          onSave={async () => {
            await updateMenuItem(target.id, { isActive: !target.isActive });
            setNotice(target.isActive ? '餐點已停用，配方保留。' : '餐點已啟用。');
            setTarget(null);
            list.reload();
          }}
        />
      )}
      {recipe && (
        <RecipeEditor item={recipe} onClose={() => setRecipe(null)} onSaved={list.reload} />
      )}
      {availability && (
        <IngredientAvailabilityDialog item={availability} onClose={() => setAvailability(null)} />
      )}
    </>
  );
}
