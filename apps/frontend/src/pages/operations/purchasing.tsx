import { useState } from 'react';
import { CatalogNotice } from '../../components/catalog-ui';
import {
  CommandDialog,
  ResourceTable,
  SimpleCommand,
  display,
} from '../../components/operations-ui';
import { opsSend, rows, value, label, type Row } from '../../api/operations';
import { Heading, useChoices, LineEditor, options, SimpleEntities, type Line } from './shared';
import '../../operations.css';
export function PurchasingPage() {
  const [tab, setTab] = useState('purchases'),
    [create, setCreate] = useState(false),
    [receipt, setReceipt] = useState<Row | null>(null),
    [lines, setLines] = useState<Line[]>([]),
    [refresh, setRefresh] = useState(0);
  const ingredients = useChoices('/ingredients'),
    suppliers = useChoices('ops:/suppliers');
  return (
    <>
      <Heading
        title="採購與供應商"
        description="申請 → 核准 → 訂購 → 部分／完整收貨；收貨與入庫流水同一交易。"
      />
      <CatalogNotice error={ingredients.error || suppliers.error} />
      <div className="ops-tabs">
        <button className="button button-white" onClick={() => setTab('purchases')}>
          採購單
        </button>
        <button className="button button-white" onClick={() => setTab('suppliers')}>
          供應商
        </button>
      </div>
      {tab === 'suppliers' ? (
        <SimpleEntities resource="suppliers" title="供應商" />
      ) : (
        <ResourceTable
          key={refresh}
          title="採購單"
          path="/purchases"
          toolbar={
            <button
              className="button button-dark"
              onClick={() => {
                setLines([]);
                setCreate(true);
              }}
            >
              新增採購申請
            </button>
          }
          columns={[
            {
              name: '單號／供應商',
              render: (r) => `${value(r.id).slice(0, 8)}／${label(r.supplier)}`,
            },
            { name: '狀態', render: (r) => display(r.status) },
            {
              name: '採購／已收貨',
              render: (r) =>
                rows(r.lines).map((l) => (
                  <p key={value(l.id)}>
                    {label(l.ingredient)} {value(l.received)}／{value(l.quantity)} {value(l.unit)} ×{' '}
                    {value(l.unitCost)}
                  </p>
                )),
            },
            { name: '備註', render: (r) => value(r.note) },
          ]}
          actions={(r, reload) => (
            <>
              {r.status === 'REQUESTED' && (
                <SimpleCommand
                  title="核准申請"
                  path={`/purchases/${value(r.id)}/status`}
                  body={{ status: 'APPROVED' }}
                  onSaved={reload}
                />
              )}
              {r.status === 'APPROVED' && (
                <SimpleCommand
                  title="確認訂購"
                  path={`/purchases/${value(r.id)}/status`}
                  body={{ status: 'ORDERED' }}
                  onSaved={reload}
                />
              )}
              {['ORDERED', 'PARTIAL'].includes(value(r.status)) && (
                <button
                  className="button button-white"
                  onClick={() => {
                    setReceipt(r);
                    setLines([]);
                  }}
                >
                  收貨
                </button>
              )}
              {['REQUESTED', 'APPROVED', 'ORDERED'].includes(value(r.status)) &&
                !rows(r.receipts).length && (
                  <SimpleCommand
                    title="取消採購"
                    path={`/purchases/${value(r.id)}/status`}
                    body={{ status: 'CANCELLED' }}
                    onSaved={reload}
                  />
                )}
            </>
          )}
        />
      )}
      {create && (
        <CommandDialog
          title="新增採購申請"
          fingerprint={JSON.stringify(lines)}
          fields={[
            {
              key: 'supplierId',
              name: '供應商',
              type: 'select',
              options: options(suppliers.items.filter((i) => i.isActive)),
            },
            { key: 'note', name: '採購原因', optional: true },
          ]}
          onClose={() => setCreate(false)}
          onSaved={() => setRefresh((v) => v + 1)}
          submit={(v) =>
            opsSend('/purchases', {
              ...v,
              lines: lines.map((l) => ({
                ingredientId: l.id,
                unit: value(ingredients.items.find((i) => i.id === l.id)?.unit),
                quantity: l.quantity,
                unitCost: l.unitCost,
              })),
            })
          }
        >
          <LineEditor
            items={ingredients.items.filter((i) => i.isActive)}
            lines={lines}
            onChange={setLines}
            cost
          />
        </CommandDialog>
      )}
      {receipt && (
        <CommandDialog
          title="採購收貨"
          fingerprint={JSON.stringify(lines)}
          onClose={() => setReceipt(null)}
          onSaved={() => setRefresh((v) => v + 1)}
          submit={(v) =>
            opsSend(`/purchases/${value(receipt.id)}/receipts`, {
              ...v,
              lines: lines.map((l) => ({ lineId: l.id, quantity: l.quantity })),
            })
          }
        >
          <LineEditor
            items={rows(receipt.lines).map((l) => ({
              ...l,
              name: `${label(l.ingredient)}（已收 ${value(l.received)}／訂購 ${value(l.quantity)}）`,
            }))}
            lines={lines}
            onChange={setLines}
          />
          <p>超收、重複項目或任一項目失敗時整筆回滾；同一請求重試不會重複入庫。</p>
        </CommandDialog>
      )}
    </>
  );
}
