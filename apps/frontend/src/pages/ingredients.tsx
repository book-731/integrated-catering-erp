import { useState, type FormEvent } from 'react';
import { Plus, Package } from 'lucide-react';
import { useAuth } from '../auth/auth-context';
import { canManageCatalog } from '../config/catalog';
import {
  getIngredients,
  createIngredient,
  updateIngredient,
  type Ingredient,
  type IngredientInput,
  type CatalogQuery,
} from '../api/catalog';
import { useCatalogList } from '../hooks/use-catalog-list';
import { ingredientFormSchema, fieldErrors, suggestedUnits } from '../config/catalog';
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

function IngredientForm({
  item,
  onClose,
  onSaved,
}: {
  item: Ingredient | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState<IngredientInput>(
    item
      ? {
          sku: item.sku,
          name: item.name,
          unit: item.unit,
          safetyStock: item.safetyStock,
          isActive: item.isActive,
        }
      : { sku: '', name: '', unit: 'g', safetyStock: '0', isActive: true },
  );
  const [errors, setErrors] = useState<Record<string, string>>({}),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const parsed = ingredientFormSchema.safeParse(value);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      if (item) await updateIngredient(item.id, parsed.data);
      else await createIngredient(parsed.data);
      onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '儲存失敗。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <CatalogDialog title={item ? '編輯食材' : '新增食材'} busy={busy} onClose={onClose}>
      <form className="user-form catalog-form" onSubmit={(event) => void submit(event)} noValidate>
        <fieldset disabled={busy}>
          <CatalogField id="ingredient-sku" label="食材 SKU" error={errors.sku}>
            <input
              id="ingredient-sku"
              value={value.sku}
              maxLength={64}
              onChange={(event) => setValue({ ...value, sku: event.target.value })}
              aria-invalid={!!errors.sku}
            />
          </CatalogField>
          <CatalogField id="ingredient-name" label="食材名稱" error={errors.name}>
            <input
              id="ingredient-name"
              value={value.name}
              maxLength={100}
              onChange={(event) => setValue({ ...value, name: event.target.value })}
              aria-invalid={!!errors.name}
            />
          </CatalogField>
          <div className="form-two-columns">
            <CatalogField id="ingredient-unit" label="基礎單位" error={errors.unit}>
              <input
                id="ingredient-unit"
                list="ingredient-units"
                value={value.unit}
                maxLength={20}
                onChange={(event) => setValue({ ...value, unit: event.target.value })}
                aria-invalid={!!errors.unit}
              />
              <datalist id="ingredient-units">
                {suggestedUnits.map((unit) => (
                  <option key={unit} value={unit} />
                ))}
              </datalist>
            </CatalogField>
            <CatalogField id="ingredient-safety" label="安全庫存" error={errors.safetyStock}>
              <input
                id="ingredient-safety"
                inputMode="decimal"
                value={value.safetyStock}
                onChange={(event) => setValue({ ...value, safetyStock: event.target.value })}
                aria-invalid={!!errors.safetyStock}
              />
            </CatalogField>
          </div>
          <p className="form-help">
            用量以此基礎單位計算，最多 3 位小數。有配方關聯或非零庫存時不可變更單位。
          </p>
          <CatalogField id="ingredient-stock" label="現有庫存（唯讀）">
            <input
              id="ingredient-stock"
              value={item?.stockQuantity ?? '0.000'}
              readOnly
              aria-readonly="true"
            />
          </CatalogField>
          <p className="form-help">此表單不直接改庫存；請至「庫存異動」建立期初或盤點流水。</p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={value.isActive}
              onChange={(event) => setValue({ ...value, isActive: event.target.checked })}
            />
            啟用食材
          </label>
          <CatalogNotice error={error} />
          <FormActions busy={busy} onClose={onClose} />
        </fieldset>
      </form>
    </CatalogDialog>
  );
}
export function IngredientsPage() {
  const { user } = useAuth(),
    manage = canManageCatalog(user?.role);
  const [q, setQ] = useState(''),
    [active, setActive] = useState(''),
    [unit, setUnit] = useState(''),
    [lowStock, setLowStock] = useState('');
  const [query, setQuery] = useState<CatalogQuery>({ q: '', isActive: '', page: 1 });
  const list = useCatalogList(getIngredients, query);
  const [editor, setEditor] = useState<{ item: Ingredient | null } | null>(null),
    [target, setTarget] = useState<Ingredient | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">INGREDIENT CATALOG</p>
          <h1>食材管理</h1>
          <p className="page-description">建立食材基礎資料，為每道配方定義一致的用量單位。</p>
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
            新增食材
          </button>
        )}
      </section>
      <CatalogTabs manage={manage} ingredients />
      {!manage && (
        <p className="catalog-readonly">
          廚房唯讀：可查食材、單位、現有／安全庫存及低庫存提醒，不能修改資料或庫存。
        </p>
      )}
      <div className="users-security-note">
        <Package size={18} />
        <span>庫存數量唯讀 · 管理者請由「庫存管理」新增期初、領料、耗損與盤點流水。</span>
      </div>
      <CatalogNotice success={notice} />
      <section className="panel">
        <form
          className="users-filters catalog-filters"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery({ q, isActive: active, unit, lowStock, page: 1 });
          }}
        >
          <CatalogSearch label="搜尋食材名稱或 SKU" value={q} onChange={setQ} />
          <ActiveFilter value={active} onChange={setActive} />
          <select
            aria-label="篩選庫存提醒"
            value={lowStock}
            onChange={(event) => setLowStock(event.target.value)}
          >
            <option value="">全部庫存狀態</option>
            <option value="true">達安全庫存</option>
            <option value="false">高於安全庫存</option>
          </select>
          <input
            className="unit-filter"
            aria-label="篩選基礎單位"
            placeholder="全部單位"
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            maxLength={20}
          />
          <button className="button button-white" type="submit">
            套用篩選
          </button>
          <ReloadButton onClick={list.reload} />
        </form>
        <CatalogTable
          headers={[
            'SKU',
            '食材名稱',
            '基礎單位',
            '現有庫存',
            '安全庫存',
            '狀態',
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
                <code>{item.sku}</code>
              </td>
              <td>
                <strong>{item.name}</strong>
              </td>
              <td>{item.unit}</td>
              <td>
                <span className="decimal-value">{item.stockQuantity}</span>
                {item.isLowStock && <small className="stock-warning">達安全庫存</small>}
              </td>
              <td className="decimal-value">{item.safetyStock}</td>
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
      {manage && editor && (
        <IngredientForm
          item={editor.item}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            setNotice('食材已儲存。');
            list.reload();
          }}
        />
      )}
      {manage && target && (
        <CatalogStatusDialog
          name={target.name}
          active={target.isActive}
          description="停用不會刪除已有配方關聯；已存在用量仍可查詢。"
          onClose={() => setTarget(null)}
          onSave={async () => {
            await updateIngredient(target.id, { isActive: !target.isActive });
            setNotice(target.isActive ? '食材已停用，配方關聯保留。' : '食材已啟用。');
            setTarget(null);
            list.reload();
          }}
        />
      )}
    </>
  );
}
