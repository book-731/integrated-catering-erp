import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { CatalogNotice } from '../../components/catalog-ui';
import { CommandDialog, ResourceTable, display } from '../../components/operations-ui';
import { opsSend, value, label } from '../../api/operations';
import { Heading, useChoices, options } from './shared';
import '../../operations.css';
export function InventoryPage() {
  const { user } = useAuth(),
    canWrite = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const ingredients = useChoices('/ingredients');
  const [open, setOpen] = useState(false),
    [refresh, setRefresh] = useState(0);
  return (
    <>
      <Heading
        title="庫存異動管理"
        description="每筆期初、進出、耗損與盤點都保留操作者、原因及前後數量。"
      />
      <CatalogNotice error={ingredients.error} />
      <div className="ops-tabs">
        <Link className="button button-white" to="/ingredients">
          食材與低庫存清單
        </Link>
        {canWrite && (
          <button className="button button-dark" onClick={() => setOpen(true)}>
            新增庫存異動
          </button>
        )}
      </div>
      <ResourceTable
        key={refresh}
        title="庫存流水"
        path="/stock-movements"
        columns={[
          { name: '食材', render: (r) => label(r.ingredient) },
          { name: '類型', render: (r) => display(r.type) },
          { name: '異動量', render: (r) => `${value(r.quantity)} ${value(r.unit)}` },
          { name: '前 → 後', render: (r) => `${value(r.before)} → ${value(r.after)}` },
          {
            name: '原因／時間',
            render: (r) => (
              <>
                {value(r.reason)}
                <br />
                {new Date(value(r.createdAt)).toLocaleString('zh-TW')}
              </>
            ),
          },
        ]}
      />
      {open && (
        <CommandDialog
          title="新增庫存異動"
          fields={[
            {
              key: 'ingredientId',
              name: '食材',
              type: 'select',
              options: options(ingredients.items),
            },
            {
              key: 'type',
              name: '異動類型',
              type: 'select',
              options: ['OPENING', 'IN', 'ISSUE', 'WASTE', 'COUNT', 'COMPENSATION'].map((id) => ({
                id,
                name: display(id),
              })),
            },
            {
              key: 'quantity',
              name: '數量（期初／盤點填實際總量，其餘填正異動量）',
              type: 'quantity',
            },
            { key: 'reason', name: '原因' },
          ]}
          onClose={() => setOpen(false)}
          onSaved={() => setRefresh((v) => v + 1)}
          submit={(v) => opsSend('/inventory', v)}
        >
          <p>期初僅限尚無流水的食材設定一次；庫存不足會整筆拒絕。</p>
        </CommandDialog>
      )}
    </>
  );
}
