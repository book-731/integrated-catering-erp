import { useState } from 'react';
import { CatalogNotice } from '../../components/catalog-ui';
import { useOps, display } from '../../components/operations-ui';
import { row, rows, value, label } from '../../api/operations';
import { Heading, useChoices } from './shared';
import '../../operations.css';
export function ReportsPage() {
  const categories = useChoices('/menu-categories'),
    [categoryId, setCategoryId] = useState('');
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' }),
    [from, setFrom] = useState(`${today.slice(0, 7)}-01`),
    [to, setTo] = useState(today);
  const state = useOps(
      `/reports?from=${from}&to=${to}${categoryId ? `&categoryId=${categoryId}` : ''}`,
    ),
    data = state.data ? row(state.data) : {};
  return (
    <>
      <Heading
        title="報表與營運分析"
        description="查詢真實 PostgreSQL 資料，以台北日期及已完成訂單統計。"
      />
      <div className="ops-tabs">
        <label>
          開始日期{' '}
          <input
            aria-label="報表開始日期"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          結束日期{' '}
          <input
            aria-label="報表結束日期"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label>
          銷售分類{' '}
          <select
            aria-label="銷售分類"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">全部分類</option>
            {categories.items.map((c) => (
              <option key={value(c.id)} value={value(c.id)}>
                {value(c.name)}
              </option>
            ))}
          </select>
        </label>
        <button className="button button-white" onClick={state.reload}>
          重新查詢
        </button>
      </div>
      <CatalogNotice error={state.error} />
      {state.loading ? (
        <p role="status">載入中…</p>
      ) : (
        state.data && (
          <>
            <div className="ops-summary">
              <article>
                營業額<strong>{value(data.revenue)} TWD</strong>
              </article>
              <article>
                完成訂單<strong>{value(data.orderCount)}</strong>
              </article>
              <article>
                收貨採購額<strong>{value(data.procurement)} TWD</strong>
              </article>
            </div>
            <div className="ops-grid">
              <section className="panel ops-panel">
                <h2>每日營業額</h2>
                <div className="ops-bars">
                  {rows(data.sales).length ? (
                    rows(data.sales).map((s) => (
                      <div key={value(s.date)}>
                        {value(s.date)}：{value(s.revenue)}／{value(s.orders)} 單
                        <div
                          className="ops-bar"
                          style={{
                            width: `${Math.min(100, (Number(s.revenue) / Math.max(1, ...rows(data.sales).map((x) => Number(x.revenue)))) * 100)}%`,
                          }}
                        />
                      </div>
                    ))
                  ) : (
                    <p>此期間沒有已完成訂單。</p>
                  )}
                </div>
              </section>
              <section className="panel ops-panel">
                <h2>熱銷餐點</h2>
                {rows(data.hot).length ? (
                  rows(data.hot).map((s, i) => (
                    <p key={i}>
                      {value(s.name)} × {value(s.quantity)}／銷售小計 {value(s.amount)}
                    </p>
                  ))
                ) : (
                  <p>沒有銷售資料</p>
                )}
              </section>
            </div>
            <section className="panel ops-panel">
              <h2>庫存耗用</h2>
              {rows(data.stock).map((s, i) => (
                <p key={i}>
                  {value(s.name) || value(s.ingredientId).slice(0, 8)}／{display(s.type)}：
                  {value(row(s._sum).quantity)} {value(s.unit)}
                </p>
              ))}
              {!rows(data.stock).length && <p>沒有異動資料</p>}
            </section>
            <section className="panel ops-panel">
              <h2>供應商採購</h2>
              {rows(data.suppliers).map((s, i) => (
                <p key={i}>
                  {value(s.name)}：{value(s.amount)}
                </p>
              ))}
            </section>
            <section className="panel ops-panel">
              <h2>出勤與排班</h2>
              {rows(data.staff).map((s, i) => (
                <p key={i}>
                  {value(s.name)}：{value(s.shifts)} 班／排班 {value(s.scheduledHours)} 小時／出勤{' '}
                  {value(s.attendanceHours)} 小時／核准請假 {value(s.leaveHours)} 小時
                </p>
              ))}
            </section>
          </>
        )
      )}
    </>
  );
}
