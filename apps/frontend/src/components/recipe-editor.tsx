import { useEffect, useState } from 'react';
import { Plus, Trash2, BookOpen } from 'lucide-react';
import {
  getIngredients,
  getRecipe,
  replaceRecipe,
  type MenuItem,
  type Ingredient,
  type RecipeRow,
  type CatalogQuery,
} from '../api/catalog';
import { useCatalogList } from '../hooks/use-catalog-list';
import { useAuth } from '../auth/auth-context';
import { canManageCatalog, positiveQuantityInputSchema } from '../config/catalog';
import { CatalogDialog, CatalogNotice, CatalogSearch, CatalogPagination } from './catalog-ui';
function IngredientPicker({
  used,
  onPick,
}: {
  used: string[];
  onPick: (ingredient: Ingredient) => void;
}) {
  const [q, setQ] = useState(''),
    [query, setQuery] = useState<CatalogQuery>({ q: '', isActive: 'true', page: 1 }),
    [selected, setSelected] = useState('');
  const list = useCatalogList(getIngredients, query);
  const chosen = list.items.find((item) => item.id === selected);
  return (
    <section className="recipe-picker" aria-label="配方食材選擇">
      <div className="recipe-picker-search">
        <CatalogSearch label="搜尋可加入的食材" value={q} onChange={setQ} />
        <button
          type="button"
          className="button button-white"
          onClick={() => {
            setSelected('');
            setQuery({ ...query, q, page: 1 });
          }}
        >
          搜尋食材
        </button>
      </div>
      {list.error ? (
        <div role="alert">
          <p>{list.error}</p>
          <button type="button" className="button button-white" onClick={list.reload}>
            重試食材查詢
          </button>
        </div>
      ) : (
        <div className="recipe-picker-select">
          <select
            aria-label="選擇配方食材"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            disabled={list.loading}
          >
            <option value="">
              {list.loading
                ? '食材載入中…'
                : list.items.length
                  ? '選擇食材（名稱 · SKU · 單位）'
                  : '沒有可選食材，請新增或更換搜尋條件'}
            </option>
            {list.items.map((item) => (
              <option key={item.id} value={item.id} disabled={used.includes(item.id)}>
                {item.name} · {item.sku} · {item.unit}
                {used.includes(item.id) ? '（已加入）' : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="button button-white"
            disabled={!chosen || used.includes(chosen.id) || list.loading}
            onClick={() => {
              if (chosen) {
                onPick(chosen);
                setSelected('');
              }
            }}
          >
            <Plus size={15} />
            加入食材
          </button>
        </div>
      )}
      <CatalogPagination
        page={query.page}
        total={list.total}
        loading={list.loading}
        onPage={(page) => {
          setSelected('');
          setQuery({ ...query, page });
        }}
      />
    </section>
  );
}
export function RecipeEditor({
  item,
  onClose,
  onSaved,
}: {
  item: MenuItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth(),
    editable = canManageCatalog(user?.role) && item.isActive;
  const [rows, setRows] = useState<RecipeRow[]>([]),
    [version, setVersion] = useState(0),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState(0),
    [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    setError(null);
    setNotice(null);
    setErrors({});
    void getRecipe(item.id, controller.signal).then(
      (recipe) => {
        if (!controller.signal.aborted) {
          setRows(recipe.items);
          setVersion(recipe.version);
          setLoading(false);
        }
      },
      (failure) => {
        if (!controller.signal.aborted) {
          setLoadError(failure instanceof Error ? failure.message : '配方載入失敗。');
          setLoading(false);
        }
      },
    );
    return () => controller.abort();
  }, [item.id, attempt]);
  async function save() {
    const invalid: Record<string, string> = {};
    for (const row of rows) {
      const parsed = positiveQuantityInputSchema.safeParse(row.quantity);
      if (!parsed.success)
        invalid[row.ingredientId] = parsed.error.issues[0]?.message ?? '用量不正確。';
    }
    setErrors(invalid);
    setError(null);
    setNotice(null);
    if (Object.keys(invalid).length) return;
    setBusy(true);
    try {
      const saved = await replaceRecipe(item.id, version, rows);
      setRows(saved.items);
      setVersion(saved.version);
      setNotice('配方已儲存，未變更庫存。');
      onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '配方儲存失敗。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <CatalogDialog title={`食材配方：${item.name}`} wide busy={busy} onClose={onClose}>
      <div className="recipe-content">
        <div className="recipe-summary">
          <BookOpen size={20} />
          <div>
            <strong>{item.name}</strong>
            <p>配方版本 {version} · 用量採食材基礎單位 · 不進行庫存扣除</p>
          </div>
          <span className="pill pill-gray">{rows.length} 項食材</span>
        </div>
        {!editable && (
          <p className="catalog-readonly">
            {item.isActive
              ? '目前角色可查詢配方，不能修改。'
              : '餐點已停用，保留配方供查詢；啟用後才可編輯。'}
          </p>
        )}
        {loading ? (
          <p className="table-state" role="status">
            正在載入配方…
          </p>
        ) : loadError ? (
          <div className="table-state" role="alert">
            <p>{loadError}</p>
            <button
              className="button button-white"
              onClick={() => setAttempt((value) => value + 1)}
            >
              重試配方查詢
            </button>
          </div>
        ) : (
          <>
            <fieldset disabled={busy}>
              {editable && (
                <IngredientPicker
                  used={rows.map((row) => row.ingredientId)}
                  onPick={(ingredient) => {
                    setRows((value) => [
                      ...value,
                      {
                        ingredientId: ingredient.id,
                        sku: ingredient.sku,
                        name: ingredient.name,
                        unit: ingredient.unit,
                        isActive: ingredient.isActive,
                        quantity: '1.000',
                      },
                    ]);
                    setNotice(null);
                  }}
                />
              )}
              <div className="table-scroll">
                <table className="users-table recipe-table">
                  <thead>
                    <tr>
                      <th>食材</th>
                      <th>SKU</th>
                      <th>每份用量</th>
                      <th>基礎單位</th>
                      <th>狀態</th>
                      {editable && <th>操作</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {!rows.length ? (
                      <tr>
                        <td colSpan={editable ? 6 : 5} className="table-state">
                          尚未設定配方食材。
                        </td>
                      </tr>
                    ) : (
                      rows.map((row) => (
                        <tr key={row.ingredientId}>
                          <td>
                            <strong>{row.name}</strong>
                          </td>
                          <td>
                            <code>{row.sku}</code>
                          </td>
                          <td>
                            {editable && row.isActive ? (
                              <>
                                <input
                                  className="quantity-input"
                                  aria-label={`用量：${row.name}`}
                                  inputMode="decimal"
                                  value={row.quantity}
                                  aria-invalid={!!errors[row.ingredientId]}
                                  onChange={(event) =>
                                    setRows((value) =>
                                      value.map((current) =>
                                        current.ingredientId === row.ingredientId
                                          ? { ...current, quantity: event.target.value }
                                          : current,
                                      ),
                                    )
                                  }
                                />
                                {errors[row.ingredientId] && (
                                  <p className="field-error">{errors[row.ingredientId]}</p>
                                )}
                              </>
                            ) : (
                              <span className="decimal-value">{row.quantity}</span>
                            )}
                          </td>
                          <td>{row.unit}</td>
                          <td>
                            <span className={`pill ${row.isActive ? 'pill-green' : 'pill-amber'}`}>
                              {row.isActive ? '啟用中' : '已停用・保留關聯'}
                            </span>
                          </td>
                          {editable && (
                            <td>
                              <button
                                type="button"
                                className="recipe-remove"
                                aria-label={`移除：${row.name}`}
                                onClick={() => {
                                  setRows((value) =>
                                    value.filter(
                                      (current) => current.ingredientId !== row.ingredientId,
                                    ),
                                  );
                                  setNotice(null);
                                }}
                              >
                                <Trash2 size={15} />
                                移除
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </fieldset>
            <p className="form-help">
              用量必須大於 0，最多 3 位小數；不提供 g／kg 等自動換算。
              {editable
                ? '停用食材只能保留既有用量或移除。關閉前請先儲存。'
                : '停用食材仍保留關聯供查詢。'}
            </p>
            <CatalogNotice error={error} success={notice} />
            <div className="recipe-actions">
              <button
                type="button"
                className="button button-white"
                disabled={busy}
                onClick={() => setAttempt((value) => value + 1)}
              >
                重新載入配方
              </button>
              <span className="muted">
                {editable ? '重新載入會捨棄未儲存變更。' : '重新查詢最新配方版本。'}
              </span>
              {editable && (
                <button
                  type="button"
                  className="button button-dark"
                  disabled={busy}
                  onClick={() => void save()}
                >
                  {busy ? '儲存中…' : '儲存配方'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </CatalogDialog>
  );
}
