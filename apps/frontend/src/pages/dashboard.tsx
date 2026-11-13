import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  CircleHelp,
  Database,
  Layers3,
  PlugZap,
  RefreshCw,
  Server,
  ShieldCheck,
  Terminal,
  TriangleAlert,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useHealth } from '../hooks/use-health';
import { apiDocsUrl } from '../config/api';
const flow = [
  '登入系統',
  '建立食材',
  '餐點與配方',
  '建立訂單',
  '製作與扣庫',
  '庫存異動',
  '銷售報表',
];

export function Dashboard() {
  const { state, refresh } = useHealth();
  const connected = state.status === 'success';
  const databaseFailure = state.status === 'error' && state.error.code === 'DATABASE_UNAVAILABLE';
  const apiReached = connected || (state.status === 'error' && Boolean(state.error.requestId));
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">WORKSPACE OVERVIEW</p>
          <h1>
            系統總覽<span className="heading-dot">.</span>
          </h1>
          <p className="page-description">掌握系統連線狀態，從穩固的基礎開始。</p>
        </div>
        <button
          className="button button-white"
          onClick={refresh}
          disabled={state.status === 'loading'}
        >
          <RefreshCw size={16} className={state.status === 'loading' ? 'animate-spin' : ''} />
          重新檢查
        </button>
      </section>
      <section className="intro-banner">
        <div className="intro-content">
          <span className="intro-kicker">
            <span />
            專案開發進度
          </span>
          <h2>營運整合，從這裡開始。</h2>
          <p>串起餐點、訂單與庫存，打造可持續擴充的餐飲管理系統。</p>
          <div className="intro-meta">
            <span>
              <CheckCheck size={15} />
              Windows 本機 ERP
            </span>
            <span className="intro-separator" />
            七大模組整合
          </div>
        </div>
        <div className="banner-art" aria-hidden="true">
          <span className="art-orbit orbit-one" />
          <span className="art-orbit orbit-two" />
          <div className="art-node node-top">
            <Server size={21} />
          </div>
          <div className="art-node node-right">
            <Database size={22} />
          </div>
          <div className="art-node node-left">
            <Layers3 size={21} />
          </div>
          <div className="art-center">
            <PlugZap size={36} />
          </div>
          <span className="art-spark spark-one" />
          <span className="art-spark spark-two" />
        </div>
      </section>
      <section className="status-grid" aria-label="連線狀態">
        <article className="metric-card">
          <div className="metric-top">
            <span>後端 API</span>
            <span className="metric-icon">
              <Server size={19} />
            </span>
          </div>
          <div className="metric-value">
            {state.status === 'loading' ? '檢查中' : apiReached ? '服務已回應' : '連線異常'}
            <span
              className={`status-dot ${state.status === 'loading' ? 'pending' : apiReached ? 'up' : 'down'}`}
            />
          </div>
          <p>
            GET <code>/api/health</code>
          </p>
        </article>
        <article className="metric-card">
          <div className="metric-top">
            <span>PostgreSQL 資料庫</span>
            <span className="metric-icon">
              <Database size={19} />
            </span>
          </div>
          <div className="metric-value">
            {state.status === 'loading'
              ? '檢查中'
              : connected
                ? '連線正常'
                : databaseFailure
                  ? '連線失敗'
                  : '尚未確認'}
            <span
              className={`status-dot ${state.status === 'loading' ? 'pending' : connected ? 'up' : 'down'}`}
            />
          </div>
          <p>
            {connected
              ? `查詢耗時 ${state.response.data.database.latencyMs} ms`
              : '透過 Prisma 執行真實資料庫查詢'}
          </p>
        </article>
        <article className="metric-card">
          <div className="metric-top">
            <span>業務模組</span>
            <span className="metric-icon">
              <Layers3 size={19} />
            </span>
          </div>
          <div className="metric-value">
            7 <span className="metric-unit">/ 7 業務模組</span>
          </div>
          <p>菜單、訂單、庫存、採購、人事與營運報表</p>
        </article>
        <article className="metric-card">
          <div className="metric-top">
            <span>目前版本</span>
            <span className="metric-icon">
              <ShieldCheck size={19} />
            </span>
          </div>
          <div className="metric-value version-value">
            v0.4.0<span className="outline-tag">Local ERP</span>
          </div>
          <p>前後端分離 · TypeScript</p>
        </article>
      </section>
      <div className="dashboard-columns">
        <section className="panel connection-panel">
          <div className="panel-heading">
            <div>
              <h2>系統連線檢查</h2>
              <p>即時驗證前端、API 與資料庫的連接</p>
            </div>
            <span
              className={`pill ${connected ? 'pill-green' : state.status === 'loading' ? 'pill-gray' : 'pill-amber'}`}
            >
              {connected ? '正常' : state.status === 'loading' ? '檢查中' : '需處理'}
            </span>
          </div>
          <div className="connection-path">
            <div>
              <span className="connection-icon">
                <Layers3 size={23} />
              </span>
              <strong>前端介面</strong>
              <small>React + Vite</small>
            </div>
            <span className={`path-line ${connected ? 'path-up' : ''}`}>
              <ArrowRight size={17} />
            </span>
            <div>
              <span className="connection-icon">
                <Server size={23} />
              </span>
              <strong>後端服務</strong>
              <small>Express API</small>
            </div>
            <span className={`path-line ${connected ? 'path-up' : ''}`}>
              <ArrowRight size={17} />
            </span>
            <div>
              <span className="connection-icon">
                <Database size={23} />
              </span>
              <strong>資料庫</strong>
              <small>PostgreSQL</small>
            </div>
          </div>
          <div className="health-result" role="status" aria-live="polite">
            {state.status === 'loading' && (
              <div className="result-line">
                <RefreshCw size={18} className="animate-spin" />
                <div>
                  <strong>正在檢查系統連線…</strong>
                  <p>正在呼叫後端健康檢查 API。</p>
                </div>
              </div>
            )}
            {state.status === 'success' && (
              <>
                <div className="result-line">
                  <Check size={19} />
                  <div>
                    <strong>所有服務連線正常</strong>
                    <p>後端已成功執行 PostgreSQL 查詢。</p>
                  </div>
                </div>
                <dl className="response-details">
                  <div>
                    <dt>服務</dt>
                    <dd>{state.response.data.service}</dd>
                  </div>
                  <div>
                    <dt>檢查時間</dt>
                    <dd>
                      {new Date(state.response.data.timestamp).toLocaleString('zh-TW', {
                        hour12: false,
                        timeZone: 'Asia/Taipei',
                      })}
                    </dd>
                  </div>
                  <div>
                    <dt>請求編號</dt>
                    <dd className="request-id">{state.response.requestId}</dd>
                  </div>
                </dl>
              </>
            )}
            {state.status === 'error' && (
              <div className="result-line result-error">
                <TriangleAlert size={20} />
                <div>
                  <strong>{state.error.message}</strong>
                  <p>
                    {state.error.code === 'DATABASE_UNAVAILABLE'
                      ? '請確認 PostgreSQL 容器已啟動，並檢查 DATABASE_URL 設定。'
                      : '請確認後端服務與 API Proxy 設定，再重新檢查。'}
                  </p>
                  {state.error.requestId && (
                    <p className="request-id">請求編號：{state.error.requestId}</p>
                  )}
                </div>
              </div>
            )}
          </div>
          <a href={apiDocsUrl} target="_blank" rel="noreferrer" className="panel-link">
            開啟 Swagger API 文件 <ArrowUpRight size={15} />
          </a>
        </section>
        <section className="panel roadmap-panel">
          <div className="panel-heading">
            <div>
              <h2>開發里程碑</h2>
              <p>先打穩基礎，再串起核心業務</p>
            </div>
            <span className="step-count">01 — 03</span>
          </div>
          <ol className="milestones">
            <li>
              <span className="milestone-number">01</span>
              <div>
                <strong>
                  系統基礎建置 <span className="tiny-tag">已完成</span>
                </strong>
                <p>專案架構、資料庫、API 與管理介面</p>
              </div>
            </li>
            <li className="current">
              <span className="milestone-number">02</span>
              <div>
                <strong>
                  食材與菜單配方 <span className="tiny-tag">本階段</span>
                </strong>
                <p>食材基礎資料、分類、餐點與用量管理</p>
              </div>
            </li>
            <li>
              <span className="milestone-number">03</span>
              <div>
                <strong>核心營運流程</strong>
                <p>食材配方、訂單與庫存交易</p>
              </div>
            </li>
          </ol>
          <div className="milestone-note">
            <CircleHelp size={16} />
            <span>先完成整合驗證，再交由組員分別優化。</span>
          </div>
        </section>
      </div>
      <section className="panel core-flow">
        <div className="panel-heading">
          <div>
            <h2>核心營運流程</h2>
            <p>以真實資料庫保存的端到端業務流程</p>
          </div>
          <span className="pill pill-gray">交易與快照</span>
        </div>
        <ol className="flow-steps">
          {flow.map((step, index) => (
            <li key={step}>
              <span className="flow-index">{String(index + 1).padStart(2, '0')}</span>
              <span>{step}</span>
              {index < flow.length - 1 && <ArrowRight size={15} className="flow-arrow" />}
            </li>
          ))}
        </ol>
        <div className="flow-footer">
          <span>
            <ShieldCheck size={15} />
            庫存扣減採用資料庫交易與持久化冪等控制
          </span>
          <Link to="/modules/inventory">
            查看庫存模組 <ArrowRight size={14} />
          </Link>
        </div>
      </section>
      <div className="foundation-note">
        <Terminal size={16} />
        <span>請使用側邊導覽操作各模組；報表僅計入真實資料與已完成訂單。</span>
        <ArrowDown size={15} className="note-arrow" />
      </div>
    </>
  );
}
