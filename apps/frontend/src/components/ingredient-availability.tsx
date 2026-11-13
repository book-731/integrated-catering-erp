import { useEffect, useState, type FormEvent } from 'react';
import {
  getIngredientAvailability,
  type MenuItem,
  type IngredientAvailability,
} from '../api/catalog';
import { CatalogDialog, CatalogNotice } from './catalog-ui';
export function IngredientAvailabilityDialog({
  item,
  onClose,
}: {
  item: MenuItem;
  onClose: () => void;
}) {
  const [servings, setServings] = useState('1'),
    [query, setQuery] = useState('1'),
    [attempt, setAttempt] = useState(0),
    [result, setResult] = useState<IngredientAvailability | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null),
    [validation, setValidation] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setResult(null);
    void getIngredientAvailability(item.id, query, controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) {
          setResult(value);
          setLoading(false);
        }
      },
      (failure) => {
        if (!controller.signal.aborted) {
          setError(failure instanceof Error ? failure.message : '食材查詢失敗。');
          setLoading(false);
        }
      },
    );
    return () => controller.abort();
  }, [item.id, query, attempt]);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^(?:[1-9]\d{0,3}|10000)$/.test(servings)) {
      setValidation('份數需為 1–10000 的整數。');
      return;
    }
    setValidation(null);
    setQuery(servings);
    setAttempt((value) => value + 1);
  }
  return (
    <CatalogDialog title={`食材足夠性：${item.name}`} wide onClose={onClose}>
      <div className="recipe-content">
        <p className="catalog-readonly">
          依基本配方與固定套餐組件估算，不含加購／客製選項；不預留、不扣庫。最終以訂單快照及製作交易檢查。
        </p>
        <form className="availability-form" onSubmit={submit} noValidate>
          <label htmlFor="availability-servings">製作份數</label>
          <input
            id="availability-servings"
            inputMode="numeric"
            value={servings}
            maxLength={5}
            onChange={(event) => setServings(event.target.value)}
            aria-invalid={!!validation}
          />
          <button className="button button-white" type="submit" disabled={loading}>
            查詢食材
          </button>
        </form>
        {validation && <p className="field-error">{validation}</p>}
        <CatalogNotice error={error} />
        {loading ? (
          <p className="table-state" role="status">
            正在查詢配方與庫存…
          </p>
        ) : result ? (
          <>
            <div className="availability-result" role="status">
              <span className={`pill ${result.canPrepare ? 'pill-green' : 'pill-amber'}`}>
                {result.canPrepare ? '食材足夠製作' : '目前無法製作'}
              </span>
              <strong>
                {result.servings} 份 · 配方版本 {result.recipeVersion}
              </strong>
              <p>
                {result.blockers.length
                  ? result.blockers.join('、')
                  : result.canPrepare
                    ? '所需食材均啟用且數量足夠。'
                    : '食材不足或有停用食材，請查看明細。'}
              </p>
            </div>
            <div className="table-scroll">
              <table className="users-table recipe-table">
                <thead>
                  <tr>
                    <th>食材／單位</th>
                    <th>每份用量</th>
                    <th>本次需求</th>
                    <th>現有庫存</th>
                    <th>安全庫存</th>
                    <th>不足數量</th>
                    <th>狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.length ? (
                    result.items.map((row) => (
                      <tr key={row.ingredientId}>
                        <td>
                          <strong>{row.name}</strong>
                          <small className="stock-warning">{row.unit}</small>
                        </td>
                        <td className="decimal-value">{row.quantityPerServing}</td>
                        <td className="decimal-value">{row.requiredQuantity}</td>
                        <td className="decimal-value">
                          {row.stockQuantity}
                          {row.isLowStock && <small className="stock-warning">達安全庫存</small>}
                        </td>
                        <td className="decimal-value">{row.safetyStock}</td>
                        <td className="decimal-value">{row.shortageQuantity}</td>
                        <td>
                          <span className={`pill ${row.sufficient ? 'pill-green' : 'pill-amber'}`}>
                            {!row.isActive ? '食材已停用' : row.sufficient ? '足夠' : '不足'}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="table-state">
                        尚未設定配方食材，不能判定可製作。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="form-help">
              查詢時間：
              {new Date(result.checkedAt).toLocaleString('zh-TW', {
                timeZone: 'Asia/Taipei',
                hour12: false,
              })}
              。庫存可能於查詢後改變，這不是庫存保留或製作承諾。
            </p>
          </>
        ) : (
          <button className="button button-white" onClick={() => setAttempt((value) => value + 1)}>
            重試食材查詢
          </button>
        )}
      </div>
    </CatalogDialog>
  );
}
