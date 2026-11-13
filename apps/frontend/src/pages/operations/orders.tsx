import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/auth-context';
import { CatalogDialog, CatalogNotice } from '../../components/catalog-ui';
import {
  CommandDialog,
  ResourceTable,
  SimpleCommand,
  display,
} from '../../components/operations-ui';
import { opsGet, opsSend, row, rows, value, label, type Row } from '../../api/operations';
import { Heading, useChoices, LineEditor, options, type Line } from './shared';
import '../../operations.css';
function OrderCreate({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const menu = useChoices('/menu-items'),
    [lines, setLines] = useState<Line[]>([{ id: '', quantity: '1' }]),
    [config, setConfig] = useState<Record<string, Row>>({}),
    [selected, setSelected] = useState<Record<number, string[]>>({}),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    for (const l of lines)
      if (l.id && !config[l.id])
        opsGet(`/menu/${l.id}/configuration`)
          .then((v) => {
            if (active) setConfig((old) => ({ ...old, [l.id]: row(v) }));
          })
          .catch((e) => {
            if (active) setError(e instanceof Error ? e.message : '選項讀取失敗');
          });
    return () => {
      active = false;
    };
  }, [lines, config]);
  return (
    <CommandDialog
      title="建立訂單"
      fingerprint={JSON.stringify({ lines, selected })}
      fields={[
        {
          key: 'type',
          name: '訂單類型',
          type: 'select',
          options: ['DINE_IN', 'TAKEAWAY', 'DELIVERY'].map((id) => ({ id, name: display(id) })),
        },
        { key: 'reference', name: '桌號／取餐名稱／外送備註' },
        { key: 'discount', name: '折扣金額', type: 'money', initial: '0' },
        { key: 'serviceFee', name: '服務費金額', type: 'money', initial: '0' },
      ]}
      onClose={onClose}
      onSaved={onSaved}
      submit={(v) => {
        if (!lines.length) throw Error('至少一項餐點');
        return opsSend('/orders', {
          ...v,
          lines: lines.map((l, index) => {
            if (!/^[1-9]\d{0,2}$|^1000$/.test(l.quantity)) throw Error('份數須為1–1000整數');
            return {
              menuItemId: l.id,
              quantity: Number(l.quantity),
              optionIds: selected[index] ?? [],
            };
          }),
        });
      }}
    >
      <CatalogNotice error={menu.error || error} />
      <LineEditor
        items={menu.items.filter((i) => i.isActive && i.isAvailable)}
        lines={lines}
        onChange={(v) => {
          setLines(v);
          setSelected({});
        }}
      />
      {lines.map((l, index) => (
        <section key={index}>
          {rows(config[l.id]?.optionGroups)
            .filter((g) => g.isActive)
            .map((g) => (
              <fieldset key={value(g.id)}>
                <legend>
                  {value(g.name)}（選 {value(g.minSelect)}–{value(g.maxSelect)}）
                </legend>
                {rows(g.options)
                  .filter((o) => o.isActive)
                  .map((o) => (
                    <label className="ops-line" key={value(o.id)}>
                      <input
                        type="checkbox"
                        checked={selected[index]?.includes(value(o.id)) ?? false}
                        onChange={(e) =>
                          setSelected({
                            ...selected,
                            [index]: e.target.checked
                              ? [...(selected[index] ?? []), value(o.id)]
                              : (selected[index] ?? []).filter((id) => id !== o.id),
                          })
                        }
                      />
                      {value(o.name)} +{value(o.price)}
                    </label>
                  ))}
              </fieldset>
            ))}
        </section>
      ))}
      <p className="ops-muted">
        價格與用量由伺服器保存快照，總額於儲存後顯示。下單不預留庫存，開始製作時整筆扣庫。
      </p>
    </CommandDialog>
  );
}
export function OrdersPage() {
  const { user } = useAuth(),
    kitchen = user?.role === 'KITCHEN';
  const [open, setOpen] = useState(false),
    [detail, setDetail] = useState<Row | null>(null),
    [payment, setPayment] = useState<Row | null>(null),
    [refresh, setRefresh] = useState(0);
  return (
    <>
      <Heading title="訂單與銷售" description="建立訂單、保存價格與配方快照，製作時原子扣庫。" />
      {!kitchen && (
        <button className="button button-dark" onClick={() => setOpen(true)}>
          新增訂單
        </button>
      )}
      <ResourceTable
        key={refresh}
        title="訂單清單"
        path="/orders"
        columns={[
          {
            name: '訂單',
            render: (r) => (
              <>
                {value(r.id).slice(0, 8)}
                <br />
                {value(r.reference)}
              </>
            ),
          },
          { name: '類型／狀態', render: (r) => `${display(r.type)}／${display(r.status)}` },
          {
            name: '總額／付款',
            render: (r) => `${value(r.total)}／${r.paidAt ? '已付款' : '未付款'}`,
          },
          { name: '時間', render: (r) => new Date(value(r.createdAt)).toLocaleString('zh-TW') },
        ]}
        actions={(r, reload) => (
          <>
            <button className="button button-white" onClick={() => setDetail(r)}>
              明細
            </button>
            {!kitchen && !r.paidAt && r.status !== 'CANCELLED' && (
              <button className="button button-white" onClick={() => setPayment(r)}>
                記錄付款
              </button>
            )}
            {r.status === 'PENDING' && (
              <SimpleCommand
                title="開始製作"
                path={`/orders/${value(r.id)}/status`}
                body={{ expectedRevision: r.revision, status: 'PREPARING' }}
                onSaved={reload}
              />
            )}
            {r.status === 'PREPARING' && (
              <SimpleCommand
                title="完成訂單"
                path={`/orders/${value(r.id)}/status`}
                body={{ expectedRevision: r.revision, status: 'COMPLETED' }}
                onSaved={reload}
              />
            )}
            {!kitchen && !r.paidAt && ['PENDING', 'PREPARING'].includes(value(r.status)) && (
              <SimpleCommand
                title="取消訂單"
                path={`/orders/${value(r.id)}/status`}
                body={{ expectedRevision: r.revision, status: 'CANCELLED' }}
                onSaved={reload}
              />
            )}
          </>
        )}
      />
      {open && (
        <OrderCreate onClose={() => setOpen(false)} onSaved={() => setRefresh((v) => v + 1)} />
      )}
      {payment && (
        <CommandDialog
          title="記錄全額付款"
          fields={[
            {
              key: 'method',
              name: '付款方式',
              type: 'select',
              options: ['CASH', 'CARD_RECORD', 'TRANSFER_RECORD'].map((id) => ({
                id,
                name: display(id),
              })),
            },
          ]}
          onClose={() => setPayment(null)}
          onSaved={() => setRefresh((v) => v + 1)}
          submit={(v) => opsSend(`/orders/${value(payment.id)}/payment`, v)}
        >
          <p>應付 {value(payment.total)} TWD。本功能僅記錄，沒有真實金流。</p>
        </CommandDialog>
      )}
      {detail && (
        <CatalogDialog title="訂單歷史明細" onClose={() => setDetail(null)} wide>
          <p>
            小計 {value(detail.subtotal)} − 折扣 {value(detail.discount)} + 服務費{' '}
            {value(detail.serviceFee)} = {value(detail.total)}
          </p>
          {rows(detail.lines).map((l) => (
            <article className="panel ops-panel" key={value(l.id)}>
              <h3>
                {value(l.name)} × {value(l.quantity)}，單價 {value(l.unitPrice)}
              </h3>
              <p>
                選項：
                {rows(row(l.snapshot).options)
                  .map((o) => `${value(o.name)} +${value(o.price)}`)
                  .join('、') || '無'}
              </p>
              <p>
                食材快照：
                {rows(row(l.snapshot).recipes)
                  .map((r) => `${value(r.name)} ${value(r.quantity)} ${value(r.unit)}`)
                  .join('、')}
              </p>
            </article>
          ))}
          <p>製作後取消不自動回庫；可回收原料需管理者另建有原因的補償流水。</p>
        </CatalogDialog>
      )}
    </>
  );
}
