# 資料庫連線固定 UTC — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 後端每條 PostgreSQL 連線都強制 `TimeZone=UTC`，讓 `timestamptz` 不再因 adapter-pg 錯存／錯讀，並重建主開發資料庫。

**Architecture:** 新增純函式 `withUtcSession()` 把 `-c TimeZone=UTC` 併入連線網址的 `options` 參數（pg 的連線網址參數會覆蓋 Pool 設定物件，所以必須改網址本身，不能只加 `options` 欄位）。`prisma.ts` 改由 `createPrismaClient()` 建立客戶端；`check-database.ts` 用 `assertUtcSession()` 驗證；整合測試以「刻意帶台北時區的網址」證明程式會蓋過去，且跨午夜時間來回不變。

**Tech Stack:** TypeScript、Prisma 7.10.1 + `@prisma/adapter-pg`、pg 8、Vitest、PostgreSQL 17（本機 embedded）。

**Spec:** `docs/superpowers/specs/2026-11-16-db-utc-session-design.md`

## Global Constraints

- 只改連線層；不改資料庫預設時區、不加 migration、不升級 Prisma／adapter／pg。
- 不改 `reports.service.ts` 的日期邏輯（仍以 `+08:00` 計算日界）。
- 錯誤訊息用繁體中文，且以「資料庫」開頭，才會被 `check-database.ts` 現有的已知錯誤 regex 原樣印出。
- 不得輸出完整連線字串（含密碼）到日誌或錯誤訊息。
- 不得使用 `prisma migrate reset`、`db push --force-reset` 或刪除 Volume。
- 重建只限開發資料庫 `127.0.0.1:55432/restaurant_erp`；測試庫 55433、Demo 庫 55434 不動。
- Demo 的 `scripts/acceptance/environment.mjs` 繞法保留不刪。

## Review Focus

1. `.env` 的 `DATABASE_URL` 已帶 `options=-c TimeZone=UTC`（從 Demo 抄來）→ 重複的 `-c` 無害，結果仍是 UTC。（Task 1 測試涵蓋）
2. `DATABASE_URL` 已帶別的 `options`（例如 `-c statement_timeout=5000`）→ 原設定要保留，只追加時區。（Task 1 測試涵蓋）
3. `DATABASE_URL` 帶 `options=-c TimeZone=Asia/Taipei` → 程式的 UTC 必須勝出（Postgres 後出現的 `-c` 覆蓋前面的）。（Task 1 單元、Task 2 整合都涵蓋）
4. 密碼含 `@`、`%` 等特殊字元或已 percent-encode → 改寫網址後帳密不可被重編碼壞掉。（Task 1 測試涵蓋）
5. Docker 版網址帶 `?schema=public` → 其他 query 參數要原樣保留。（Task 1 測試涵蓋）

---

### Task 1: 時區連線輔助函式（純函式）

**Files:**
- Create: `apps/backend/src/lib/session-timezone.ts`
- Test: `apps/backend/tests/session-timezone.test.ts`

**Interfaces:**
- Produces:
  - `export const UTC_SESSION_OPTION = '-c TimeZone=UTC'`
  - `export function withUtcSession(connectionString: string): string` — 回傳新網址，`options` 參數 = 原 `options`（去頭尾空白）+ 空格 + `UTC_SESSION_OPTION`；原本沒有就只放 `UTC_SESSION_OPTION`。用 `new URL()` + `searchParams.set('options', …)`（與 `environment.mjs` 已驗證可用的作法相同），其他部分不動。
  - `export function assertUtcSession(timeZone: string): void` — `timeZone !== 'UTC'` 時丟 `Error('資料庫連線時區必須是 UTC，目前為 ' + timeZone + '。')`。

- [ ] **Step 1: 寫失敗測試**

```ts
import { describe, expect, it } from 'vitest';
import { assertUtcSession, withUtcSession } from '../src/lib/session-timezone.js';

const opts = (url: string) => new URL(url).searchParams.get('options');

describe('withUtcSession', () => {
  it('沒有 options 時加上 UTC', () => {
    expect(opts(withUtcSession('postgresql://u:p@127.0.0.1:55432/restaurant_erp'))).toBe('-c TimeZone=UTC');
  });
  it('保留既有 options 並把 UTC 放最後', () => {
    const url = 'postgresql://u:p@h:1/db?options=-c%20statement_timeout%3D5000';
    expect(opts(withUtcSession(url))).toBe('-c statement_timeout=5000 -c TimeZone=UTC');
  });
  it('既有台北時區會被後面的 UTC 覆蓋', () => {
    const url = 'postgresql://u:p@h:1/db?options=-c%20TimeZone%3DAsia%2FTaipei';
    expect(opts(withUtcSession(url))).toBe('-c TimeZone=Asia/Taipei -c TimeZone=UTC');
  });
  it('已有 UTC 時重複追加仍以 UTC 結尾', () => {
    const url = 'postgresql://u:p@h:1/db?options=-c%20TimeZone%3DUTC';
    expect(opts(withUtcSession(url))?.endsWith('-c TimeZone=UTC')).toBe(true);
  });
  it('保留其他參數與帳密編碼', () => {
    const out = new URL(withUtcSession('postgresql://u:p%40ss%25@h:1/db?schema=public'));
    expect(out.searchParams.get('schema')).toBe('public');
    expect(out.password).toBe('p%40ss%25');
    expect(out.username).toBe('u');
    expect(out.pathname).toBe('/db');
  });
});

describe('assertUtcSession', () => {
  it('UTC 通過', () => expect(() => assertUtcSession('UTC')).not.toThrow());
  it('非 UTC 丟出以「資料庫」開頭的錯誤', () => {
    expect(() => assertUtcSession('Asia/Taipei')).toThrow(/^資料庫連線時區必須是 UTC，目前為 Asia\/Taipei。$/);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npm test -w @erp/backend -- tests/session-timezone.test.ts`
Expected: FAIL（找不到 `../src/lib/session-timezone.js`）

- [ ] **Step 3: 實作 `session-timezone.ts`**（依 Interfaces；檔案不得 import `env`，保持可在無 `.env` 下單元測試）

- [ ] **Step 4: 執行確認通過**

Run: `npm test -w @erp/backend -- tests/session-timezone.test.ts`
Expected: PASS（7 tests）

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/lib/session-timezone.ts apps/backend/tests/session-timezone.test.ts
git commit -m "feat(db): add UTC session connection helpers"
```

---

### Task 2: 接上 Prisma、啟動檢查與跨午夜整合測試

**Files:**
- Modify: `apps/backend/src/lib/prisma.ts`（整檔，約 12 行）
- Modify: `apps/backend/scripts/check-database.ts`（在 `SET TRANSACTION READ ONLY` 之後加時區檢查；最後的成功訊息可補一句「連線時區 UTC」）
- Create: `apps/backend/tests/session-timezone.integration.test.ts`
- Modify: `docs/KNOWN_LIMITATIONS.md`（第一段時區限制）

**Interfaces:**
- Consumes: Task 1 的 `withUtcSession`、`assertUtcSession`。
- Produces:
  - `export function createPrismaClient(connectionString: string): PrismaClient` — `new PrismaPg({ connectionString: withUtcSession(connectionString), max: 5, connectionTimeoutMillis: 3000, query_timeout: 3000, statement_timeout: 3000 })` 包成 `PrismaClient`（保留現有四個參數值）。
  - `export const prisma = createPrismaClient(env.DATABASE_URL)`（既有匯出名稱不變，其他模組免改）。

- [ ] **Step 1: 寫失敗的整合測試**

測試檔開頭照 `health.integration.test.ts` 的方式檢查 `RUN_DB_INTEGRATION`。用 `process.env.DATABASE_URL`（runner 已設成測試庫）組出「刻意台北時區」網址：`url.searchParams.set('options', '-c TimeZone=Asia/Taipei')`，以此建立 `const client = createPrismaClient(taipeiUrl)`，`afterAll` 中 `client.$disconnect()`。

```ts
it('對照組：未經處理的連線確實是台北時區', async () => {
  const raw = new PrismaClient({ adapter: new PrismaPg({ connectionString: taipeiUrl }) });
  try {
    const [row] = await raw.$queryRaw<{ TimeZone: string }[]>`SHOW TimeZone`;
    expect(row.TimeZone).toBe('Asia/Taipei');
  } finally { await raw.$disconnect(); }
});

it('createPrismaClient 蓋過網址的台北時區，連線為 UTC', async () => {
  const [row] = await client.$queryRaw<{ TimeZone: string }[]>`SHOW TimeZone`;
  expect(row.TimeZone).toBe('UTC');
});

it('跨午夜時間寫入讀回不變，且落在正確的台北日期', async () => {
  const beforeMidnight = new Date('2026-11-12T23:59:59.999+08:00'); // 15:59:59.999Z
  const midnight = new Date('2026-11-13T00:00:00+08:00');          // 16:00:00.000Z
  const { start, end } = dateWindow({ from: '2026-11-13', to: '2026-11-13' } as Query);
  await client.$transaction(async (tx) => {
    await tx.$executeRaw`CREATE TEMP TABLE tz_probe (id int, at timestamptz(3)) ON COMMIT DROP`;
    await tx.$executeRaw`INSERT INTO tz_probe VALUES (1, ${beforeMidnight}), (2, ${midnight})`;
    const rows = await tx.$queryRaw<{ id: number; at: Date }[]>`SELECT id, at FROM tz_probe ORDER BY id`;
    expect(rows.map((r) => r.at.toISOString())).toEqual([
      '2026-11-12T15:59:59.999Z', '2026-11-12T16:00:00.000Z',
    ]);
    const inDay = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM tz_probe WHERE at >= ${start} AND at < ${end} ORDER BY id`;
    expect(inDay.map((r) => r.id)).toEqual([2]);
  });
});
```

`dateWindow` 從 `../src/modules/operations/reports.service.js` 匯入，`Query` 從 `../src/modules/operations/validation.js` 匯入（用報表真正的日界，取代 spec 寫的「呼叫報表 API」：報表會另開唯讀交易，看不到未 commit 的測試資料，若改成 commit 真訂單又得滿足一堆 CHECK 約束，所以這是我的決定）。對照組的 `PrismaClient` 從 `../src/generated/prisma/client.js`、`PrismaPg` 從 `@prisma/adapter-pg` 匯入；不要直接用 `pg.Client`，因為專案沒有 `@types/pg`，不新增依賴。

- [ ] **Step 2: 執行確認失敗**

先確保 DB 已啟動：`node scripts/local-postgres.mjs start`
Run: `npm run test:integration`
Expected: FAIL — `createPrismaClient` 不是 `prisma.ts` 的匯出。

- [ ] **Step 3: 改 `prisma.ts`**（依 Interfaces）

- [ ] **Step 4: 再跑整合測試**

Run: `npm run test:integration`
Expected: 全部 PASS（含新增 3 個；既有整合測試不可有新失敗）

- [ ] **Step 5: 在 `check-database.ts` 加檢查**

交易內 `const [{ TimeZone }] = await transaction.$queryRaw<{ TimeZone: string }[]>\`SHOW TimeZone\`; assertUtcSession(TimeZone);`

Run: `npm run db`
Expected: 成功訊息，exit code 0。暫時把 `prisma.ts` 改成不套 `withUtcSession` 手動跑一次，應看到「資料庫連線時區必須是 UTC，目前為 Asia/Taipei。」且 exit code 1；確認後還原。

- [ ] **Step 6: 更新 `docs/KNOWN_LIMITATIONS.md` 第一段**

改為：已在 `apps/backend/src/lib/prisma.ts` 的連線層強制 `TimeZone=UTC`（`withUtcSession`），`npm run db` 會檢查，`session-timezone.integration.test.ts` 鎖住跨午夜行為；Demo 的連線參數繞法保留作為雙重保險；2026-11-16 主開發資料庫已清空重建，舊錯存資料不再存在。

- [ ] **Step 7: 全套驗證**

Run: `npm run check`
Expected: validate、typecheck、unit tests、build 全部通過。

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/lib/prisma.ts apps/backend/scripts/check-database.ts apps/backend/tests/session-timezone.integration.test.ts docs/KNOWN_LIMITATIONS.md
git commit -m "fix(db): force UTC session timezone for all Prisma connections"
```

---

### Task 3: 重建主開發資料庫（會刪資料，需使用者當下確認）

**Files:** 無程式變更。

- [ ] **Step 1: 確認目標**

從 `.env` 讀 `DATABASE_URL`，只印出 host、port、資料庫名稱（不印帳密）。必須是 `127.0.0.1`、`55432`、`restaurant_erp`；不符就停止並回報。

- [ ] **Step 2: 向使用者確認**

訊息需寫明：將清空 `127.0.0.1:55432/restaurant_erp` 的 `public` schema，所有資料（含帳號）無法還原。取得明確同意才繼續。

- [ ] **Step 3: 清空 schema**

在 `apps/backend` 下用 Node + `pg`（不依賴 psql）連 `DATABASE_URL`，執行 `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`。
Expected: 無錯誤。

- [ ] **Step 4: 重跑 migration 與檢查**

Run: `npm run db:deploy` → Expected: 4 個 migration 全部套用。
Run: `npm run db` → Expected: 成功訊息（含 UTC 檢查），exit code 0。

- [ ] **Step 5: 建管理員**

`npm run admin:bootstrap` 會互動輸入 Email 與隱藏密碼，請使用者自己在終端機執行；完成後 `npm run dev`，到 `http://127.0.0.1:5173/login` 登入確認。
