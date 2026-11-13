import { useState } from 'react';
import { CatalogNotice } from '../../components/catalog-ui';
import { type Field } from '../../components/operations-ui';
import { Heading, useChoices, options, SimpleEntities, simpleFields } from './shared';
import '../../operations.css';
export function StaffPage() {
  const [tab, setTab] = useState('employees');
  const employees = useChoices('ops:/employees'),
    jobs = useChoices('ops:/jobs');
  const employeeField: Field = {
    key: 'employeeId',
    name: '員工',
    type: 'select',
    options: options(employees.items.filter((i) => i.isActive)),
  };
  const interval: Field[] = [
    employeeField,
    { key: 'start', name: '開始時間', type: 'datetime-local' },
    { key: 'end', name: '結束時間', type: 'datetime-local' },
  ];
  const config: Record<string, { title: string; fields: Field[] }> = {
    jobs: { title: '職務', fields: simpleFields.jobs! },
    employees: {
      title: '員工',
      fields: [
        { key: 'code', name: '員工編號' },
        { key: 'name', name: '姓名' },
        { key: 'contact', name: '聯絡資訊', optional: true },
        { key: 'jobId', name: '職務', type: 'select', options: options(jobs.items) },
        { key: 'isActive', name: '啟用', type: 'checkbox' },
      ],
    },
    shifts: {
      title: '班表',
      fields: [
        ...interval,
        { key: 'note', name: '備註', optional: true },
        { key: 'isActive', name: '啟用班次', type: 'checkbox' },
      ],
    },
    attendance: {
      title: '出勤',
      fields: [
        ...interval.map((f) => (f.key === 'end' ? { ...f, optional: true } : f)),
        { key: 'note', name: '備註／修正原因', optional: true },
      ],
    },
    leaves: { title: '請假', fields: [...interval, { key: 'reason', name: '請假原因' }] },
  };
  return (
    <>
      <Heading
        title="員工與排班"
        description="採半開區間檢查班表與請假衝突；出勤由管理者登錄，不計算薪資。"
      />
      <CatalogNotice error={employees.error || jobs.error} />
      <div className="ops-tabs">
        {Object.entries(config).map(([key, c]) => (
          <button key={key} className="button button-white" onClick={() => setTab(key)}>
            {c.title}
          </button>
        ))}
      </div>
      <SimpleEntities
        key={tab}
        resource={tab}
        title={config[tab]!.title}
        fields={config[tab]!.fields}
      />
    </>
  );
}
