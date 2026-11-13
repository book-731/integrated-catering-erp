import { useState } from 'react';
import { useAuth } from '../auth/auth-context';
import { CatalogNotice } from '../components/catalog-ui';
import { OperationsNav, useOps, CommandDialog } from '../components/operations-ui';
import { opsSend, row, rows, value, type Row } from '../api/operations';
import { useChoices, LineEditor, options } from './operations';
import '../operations.css';
export function MenuConfigurationPage() {
  const { user } = useAuth(),
    manage = ['ADMIN', 'MANAGER'].includes(user?.role ?? '');
  const menu = useChoices('/menu-items');
  const [selected, setSelected] = useState('');
  return (
    <>
      <div className="ops-heading">
        <h1>套餐、加購與客製化</h1>
        <p>套餐採固定組件與獨立售價；選項可設定價差及額外食材。</p>
      </div>
      <OperationsNav />
      <CatalogNotice error={menu.error} />
      <label>
        餐點{' '}
        <select
          aria-label="設定餐點"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">請選擇餐點</option>
          {menu.items.map((m) => (
            <option key={value(m.id)} value={value(m.id)}>
              {value(m.name)}
            </option>
          ))}
        </select>
      </label>
      {selected && <Configuration key={selected} id={selected} menu={menu.items} manage={manage} />}
    </>
  );
}
function Configuration({ id, menu, manage }: { id: string; menu: Row[]; manage: boolean }) {
  const state = useOps(`/menu/${id}/configuration`),
    config = state.data ? row(state.data) : {},
    ingredients = useChoices(manage ? '/ingredients' : '');
  const [mode, setMode] = useState(''),
    [edit, setEdit] = useState<Row | null>(null),
    [lines, setLines] = useState<{ id: string; quantity: string }[]>([]);
  const groups = rows(config.optionGroups),
    parts = rows(config.bundleParts);
  return (
    <>
      <CatalogNotice error={state.error || (manage ? ingredients.error : '')} />
      {state.loading ? (
        <p role="status">載入中…</p>
      ) : (
        <>
          <section className="panel ops-panel">
            <h2>套餐組件</h2>
            <p>
              {parts.map((p) => `${value(row(p.child).name)} × ${value(p.quantity)}`).join('、') ||
                '一般餐點（沒有套餐組件）'}
            </p>
            {manage && (
              <button
                className="button button-white"
                onClick={() => {
                  setLines(
                    parts.map((p) => ({ id: value(p.childId), quantity: value(p.quantity) })),
                  );
                  setMode('bundle');
                }}
              >
                編輯套餐
              </button>
            )}
            <p className="ops-muted">
              套餐原本配方與各組件配方會一併耗用；組件自選選項不在固定套餐內，請改於套餐本身設定。
            </p>
          </section>
          <section className="panel ops-panel">
            <h2>選項群組</h2>
            {manage && (
              <button
                className="button button-dark"
                onClick={() => {
                  setEdit(null);
                  setMode('group');
                }}
              >
                新增群組
              </button>
            )}
            {groups.map((g) => (
              <article className="panel ops-panel" key={value(g.id)}>
                <h3>
                  {value(g.name)}（選 {value(g.minSelect)}–{value(g.maxSelect)}；
                  {g.isActive ? '啟用' : '停用'}）
                </h3>
                {manage && (
                  <button
                    className="button button-white"
                    onClick={() => {
                      setEdit(g);
                      setMode('group');
                    }}
                  >
                    編輯群組
                  </button>
                )}
                {rows(g.options).map((o) => (
                  <div className="ops-line" key={value(o.id)}>
                    <span>
                      {value(o.name)} +{value(o.price)}／{o.isActive ? '供應' : '停用'}
                    </span>
                    <span>
                      {rows(o.recipes)
                        .map(
                          (r) =>
                            `${value(row(r.ingredient).name)} ${value(r.quantity)} ${value(row(r.ingredient).unit)}`,
                        )
                        .join('、')}
                    </span>
                    {manage && (
                      <button
                        className="button button-white"
                        onClick={() => {
                          setEdit({ ...o, groupId: g.id });
                          setLines(
                            rows(o.recipes).map((r) => ({
                              id: value(r.ingredientId),
                              quantity: value(r.quantity),
                            })),
                          );
                          setMode('option');
                        }}
                      >
                        編輯選項
                      </button>
                    )}
                  </div>
                ))}
                {manage && (
                  <button
                    className="button button-white"
                    onClick={() => {
                      setEdit({ groupId: g.id });
                      setLines([]);
                      setMode('option');
                    }}
                  >
                    新增選項／加購
                  </button>
                )}
              </article>
            ))}
          </section>
        </>
      )}
      {mode === 'bundle' && (
        <CommandDialog
          title="編輯套餐組件"
          fingerprint={JSON.stringify(lines)}
          onClose={() => setMode('')}
          onSaved={state.reload}
          submit={(v) => {
            if (lines.some((l) => !/^([1-9]\d?|100)$/.test(l.quantity)))
              throw Error('套餐份數須為1–100整數');
            return opsSend(
              `/menu/${id}/bundle`,
              { ...v, parts: lines.map((l) => ({ childId: l.id, quantity: Number(l.quantity) })) },
              'PUT',
            );
          }}
        >
          <LineEditor
            items={menu.filter((m) => m.id !== id && m.isActive)}
            lines={lines}
            onChange={setLines}
          />
        </CommandDialog>
      )}
      {mode === 'group' && (
        <CommandDialog
          title="選項群組"
          initial={edit ?? {}}
          fields={[
            { key: 'name', name: '群組名稱' },
            { key: 'minSelect', name: '最少選取數', type: 'integer', initial: '0' },
            { key: 'maxSelect', name: '最多選取數', type: 'integer', initial: '1' },
            { key: 'isActive', name: '啟用', type: 'checkbox' },
          ]}
          onClose={() => setMode('')}
          onSaved={state.reload}
          submit={(v) =>
            opsSend(
              `/option-groups${edit ? `/${value(edit.id)}` : ''}`,
              { ...v, menuItemId: id },
              edit ? 'PUT' : 'POST',
            )
          }
        />
      )}
      {mode === 'option' && (
        <CommandDialog
          title="選項／加購品"
          fingerprint={JSON.stringify(lines)}
          initial={edit ?? {}}
          fields={[
            { key: 'name', name: '選項名稱' },
            { key: 'price', name: '加價金額', type: 'money', initial: '0' },
            { key: 'isActive', name: '供應', type: 'checkbox' },
          ]}
          onClose={() => setMode('')}
          onSaved={state.reload}
          submit={(v) =>
            opsSend(
              `/menu-options${edit?.id ? `/${value(edit.id)}` : ''}`,
              {
                ...v,
                groupId: edit?.groupId,
                recipes: lines.map((l) => ({
                  ingredientId: l.id,
                  quantity: l.quantity,
                  unit: value(ingredients.items.find((i) => i.id === l.id)?.unit),
                })),
              },
              edit?.id ? 'PUT' : 'POST',
            )
          }
        >
          <LineEditor items={ingredients.items} lines={lines} onChange={setLines} />
          <p>不影響食材的選項（例如辣度）可不填配方；加購品請填額外食材用量。</p>
        </CommandDialog>
      )}
    </>
  );
}
