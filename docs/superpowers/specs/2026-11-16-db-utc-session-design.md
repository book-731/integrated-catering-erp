# 資料庫連線固定 UTC（修正 timestamptz 時區錯存）— 簡短設計

日期：2026-11-16｜負責：資料庫／後端｜規模：小改動

## 目的與原因

`@prisma/adapter-pg` 在 PostgreSQL 連線時區不是 UTC 的時候，會把 `timestamptz` 的時區資訊弄掉，存進去和讀出來的時間都偏 8 小時（見 `docs/KNOWN_LIMITATIONS.md`）。本機 PostgreSQL 預設用台北時區，所以主開發環境會出錯。現在只有 Demo 資料庫用連線網址的 `options=-c TimeZone=UTC` 繞過去（`scripts/acceptance/environment.mjs`）。

需求裡「銷售資料查詢：每日／每月／特定期間」和第 7 項報表都是照日期算的，時間存錯，報表數字就會錯。

## 目標

- 後端每一條資料庫連線都固定使用 UTC，不必靠每個人的 `.env` 寫對。
- 時區設錯時要明確報錯，不能默默存錯資料。
- 用正式整合測試防止以後又壞掉。
- 清空並重建主開發資料庫（使用者已確認裡面沒有要保留的資料）。

## 不做的事

- 不改資料庫層的預設時區（方案 B）。
- 不寫舊資料的修正腳本（資料直接清掉）。
- 不升級 Prisma 或 adapter 版本。
- 不改報表的日期邏輯：`reports.service.ts` 已經用 `+08:00` 算一天的範圍，只要存進去的時間是對的，結果就對。

## 考慮過的方案

| 方案 | 內容 | 取捨 |
|---|---|---|
| **A（採用）** | 在 `apps/backend/src/lib/prisma.ts` 的 `PrismaPg` 連線設定加上 `options: '-c TimeZone=UTC'`，另外加啟動檢查和測試 | 只改一處，開發、測試、Docker 都會套用；用 psql 等外部工具直接連時，看到的仍是台北時間（只影響顯示） |
| B | 寫 migration，`ALTER DATABASE ... SET timezone='UTC'` | 任何工具連進來都一樣；但沒跑這個 migration 的資料庫會再出錯，單獨用不夠 |
| C | 只在 `.env` 的 `DATABASE_URL` 加 options | `setup:env` 不會覆寫已有的 `.env`，每位組員都要自己改，容易漏 |

使用者選 **A**。

## 設計

1. **連線設定**：`prisma.ts` 的 `PrismaPg({...})` 加上 `options: '-c TimeZone=UTC'`。這個 adapter 把設定交給 node-postgres（pg）的 Pool，pg 會在建立連線時送出這個參數。如果 `DATABASE_URL` 自己也帶了 `options`，以程式裡的設定為準，或兩者合併；由實作者確認 pg 的實際行為後決定，結果一定要是 UTC。
2. **啟動檢查**：`apps/backend/scripts/check-database.ts`（也就是 `npm run db`）加上 `SHOW TimeZone` 檢查，結果不是 `UTC` 就報錯並結束，錯誤訊息用中文，沿用現有格式。
3. **回歸測試**：在 `apps/backend/tests/` 新增整合測試（跟其他整合測試一樣需要 `RUN_DB_INTEGRATION=1`），內容包括：
   - 透過 `prisma` 讀出連線時區，確認是 `UTC`；
   - 寫入一筆台北時間 23:59:59.999 和一筆隔天 00:00:00 的時間（例如 `completedAt`），讀回來的 UTC 時間要完全一致；
   - 用報表 API 查詢這兩天，跨午夜的兩筆要分別算在各自那一天。可以參考 `scripts/acceptance/scenario.mjs` 第 471 行附近現有的午夜案例。
   - 測試資料要在交易內 rollback，或依現有整合測試的方式清掉。
4. **重建主開發資料庫**：只動開發資料庫（`127.0.0.1:55432`），不動測試庫（55433）和 Demo 庫（55434）。做法是清空開發資料庫的 `public` schema，然後依序執行 `npm run db:deploy`、`npm run db`、`npm run admin:bootstrap`。
   > 這一步會刪掉資料、無法還原。執行前會再向使用者確認一次。README 禁止 `migrate reset` 和刪除 Volume，所以改用手動清空 schema。
5. **文件**：更新 `docs/KNOWN_LIMITATIONS.md`，把時區那條改寫成「已在連線層固定 UTC，Demo 的繞法可以保留也可以移除」。是否移除 Demo 那段繞法由實作者決定，建議保留，因為多一層保險也不會出錯。

## 留給實作者決定

- 新測試檔的名稱，以及要放在現有的哪個 integration 檔裡。
- `DATABASE_URL` 已經帶 `options` 時要怎麼合併（第 1 點）。

## 完成標準

- 本機 PostgreSQL 維持台北時區時，`npm run test:integration`（含新的午夜測試）全部通過。
- `npm run check` 和 `npm run db` 都通過。
- 主開發資料庫已重建，管理員可以登入。
