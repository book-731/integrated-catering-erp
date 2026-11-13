import { useEffect, useState } from 'react';
import {
  CommandDialog,
  ResourceTable,
  SimpleCommand,
  OperationsNav,
  display,
  type Field,
} from '../../components/operations-ui';
import { opsSend, choices, value, label, type Row } from '../../api/operations';
import '../../operations.css';
export const options = (items: Row[]) =>
  items.map((i) => ({
    id: value(i.id),
    name: `${value(i.name)}${i.unit ? ` (${value(i.unit)})` : ''}`,
  }));
export function useChoices(path: string) {
  const [items, setItems] = useState<Row[]>([]),
    [error, setError] = useState(''),
    [version, setVersion] = useState(0);
  useEffect(() => {
    const listener = () => setVersion((v) => v + 1);
    window.addEventListener('erp:changed', listener);
    return () => window.removeEventListener('erp:changed', listener);
  }, []);
  useEffect(() => {
    if (!path) return;
    let active = true;
    choices(path)
      .then((v) => {
        if (active) setItems(v);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : '選項載入失敗');
      });
    return () => {
      active = false;
    };
  }, [path, version]);
  return { items, error };
}
export function Heading({ title, description }: { title: string; description: string }) {
  return (
    <>
      <div className="ops-heading">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <OperationsNav />
    </>
  );
}
export type Line = { id: string; quantity: string; unitCost?: string };
export function LineEditor({
  items,
  lines,
  onChange,
  cost = false,
}: {
  items: Row[];
  lines: Line[];
  onChange: (v: Line[]) => void;
  cost?: boolean;
}) {
  return (
    <section>
      <p className="ops-muted">選擇項目並輸入數量；食材使用原始基礎單位，不自動換算。</p>
      {lines.map((l, index) => (
        <div className="ops-line" key={index}>
          <select
            aria-label={`項目${index + 1}`}
            required
            value={l.id}
            onChange={(e) =>
              onChange(lines.map((v, i) => (i === index ? { ...v, id: e.target.value } : v)))
            }
          >
            <option value="">請選擇</option>
            {items.map((i) => (
              <option key={value(i.id)} value={value(i.id)}>
                {value(i.name)} {value(i.unit)}
              </option>
            ))}
          </select>
          <input
            aria-label={`數量${index + 1}`}
            required
            pattern="(0|[1-9][0-9]*)(\.[0-9]{1,3})?"
            placeholder="數量"
            value={l.quantity}
            onChange={(e) => {
              e.target.setCustomValidity(/[1-9]/.test(e.target.value) ? '' : '數量須大於零');
              onChange(lines.map((v, i) => (i === index ? { ...v, quantity: e.target.value } : v)));
            }}
          />
          {cost && (
            <input
              required
              aria-label={`單價${index + 1}`}
              pattern="(0|[1-9][0-9]*)(\.[0-9]{1,2})?"
              value={l.unitCost ?? '0'}
              onChange={(e) =>
                onChange(
                  lines.map((v, i) => (i === index ? { ...v, unitCost: e.target.value } : v)),
                )
              }
            />
          )}
          <button
            type="button"
            className="button button-white"
            onClick={() => onChange(lines.filter((_, i) => i !== index))}
          >
            移除
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button button-white"
        onClick={() => onChange([...lines, { id: '', quantity: '1', unitCost: '0' }])}
      >
        新增一列
      </button>
    </section>
  );
}
export const simpleFields: Record<string, Field[]> = {
  suppliers: [
    { key: 'name', name: '供應商名稱' },
    { key: 'contact', name: '聯絡資訊', optional: true },
    { key: 'isActive', name: '啟用', type: 'checkbox' },
  ],
  jobs: [
    { key: 'name', name: '職務名稱' },
    { key: 'isActive', name: '啟用', type: 'checkbox' },
  ],
};
export function EntityEditor({
  resource,
  title,
  fields,
  initial,
  onClose,
  onSaved,
}: {
  resource: string;
  title: string;
  fields: Field[];
  initial?: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const normalized = { ...initial };
  for (const f of fields)
    if (f.type === 'datetime-local' && normalized[f.key]) {
      const d = new Date(value(normalized[f.key]));
      normalized[f.key] = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    }
  return (
    <CommandDialog
      title={title}
      fields={fields}
      initial={normalized}
      onClose={onClose}
      onSaved={onSaved}
      submit={(v) =>
        opsSend(
          `/${resource}${initial ? `/${value(initial.id)}` : ''}`,
          v,
          initial ? 'PUT' : 'POST',
        )
      }
    />
  );
}
export function SimpleEntities({
  resource,
  title,
  fields = simpleFields[resource] ?? [],
}: {
  resource: string;
  title: string;
  fields?: Field[];
}) {
  const [edit, setEdit] = useState<Row | null | undefined>(undefined),
    [refresh, setRefresh] = useState(0);
  return (
    <>
      <ResourceTable
        key={refresh}
        path={`/${resource}`}
        title={title}
        columns={[
          { name: '名稱／員工', render: (r) => value(r.name) || label(r.employee) },
          {
            name: '資料',
            render: (r) =>
              r.start
                ? `${new Date(value(r.start)).toLocaleString('zh-TW')} → ${r.end ? new Date(value(r.end)).toLocaleString('zh-TW') : '尚未下班'}`
                : value(r.contact) || value(r.code) || label(r.job),
          },
          {
            name: '狀態',
            render: (r) =>
              r.status
                ? display(r.status)
                : r.isActive !== undefined
                  ? display(r.isActive)
                  : '已保存',
          },
        ]}
        toolbar={
          <button className="button button-dark" onClick={() => setEdit(null)}>
            新增{title}
          </button>
        }
        actions={(r, reload) => (
          <>
            {resource !== 'leaves' && (
              <button className="button button-white" onClick={() => setEdit(r)}>
                編輯
              </button>
            )}
            {resource === 'leaves' && r.status === 'REQUESTED' && (
              <>
                <SimpleCommand
                  title="核准"
                  path={`/leaves/${value(r.id)}/status`}
                  body={{ status: 'APPROVED' }}
                  onSaved={reload}
                />
                <SimpleCommand
                  title="拒絕"
                  path={`/leaves/${value(r.id)}/status`}
                  body={{ status: 'REJECTED' }}
                  onSaved={reload}
                />
              </>
            )}
            {resource === 'leaves' && r.status === 'APPROVED' && (
              <SimpleCommand
                title="取消請假"
                path={`/leaves/${value(r.id)}/status`}
                body={{ status: 'CANCELLED' }}
                onSaved={reload}
              />
            )}
          </>
        )}
      />
      {edit !== undefined && (
        <EntityEditor
          resource={resource}
          title={`${edit ? '編輯' : '新增'}${title}`}
          fields={fields}
          {...(edit ? { initial: edit } : {})}
          onClose={() => setEdit(undefined)}
          onSaved={() => setRefresh((v) => v + 1)}
        />
      )}
    </>
  );
}
