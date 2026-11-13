import { ArrowLeft, Construction } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { modules } from '../config/modules';
export function ModulePlaceholder() {
  const { slug } = useParams();
  const module = modules.find((item) => item.slug === slug);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">MANAGEMENT MODULE</p>
          <h1>{module?.name ?? '找不到此頁面'}</h1>
          <p className="page-description">{module?.description ?? '請從側邊欄選擇有效的模組。'}</p>
        </div>
      </div>
      <section className="panel empty-state">
        <span className="empty-icon">
          <Construction size={35} />
        </span>
        <span className="pill pill-amber">{module ? '尚未開發' : '404'}</span>
        <h2>{module ? '這個模組即將進入開發' : '此頁面不存在'}</h2>
        <p>
          {module
            ? '目前已完成登入、食材與菜單配方管理。此模組尚未提供資料查詢與操作功能。'
            : '請返回系統總覽，或使用側邊欄導覽。'}
        </p>
        <Link to="/" className="button button-dark">
          <ArrowLeft size={16} />
          返回系統總覽
        </Link>
      </section>
    </>
  );
}
