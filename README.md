# 餐飲業整合型 ERP 管理系統

## 2026-11-14 組內5分鐘展示

本機根目錄執行 `npm run demo:start`、`npm run demo:stage`，使用 **http://localhost:5175/login**。帳號取得、5分鐘操作卡、庫存／報表預期值與離線備案見 [明日Demo手冊](docs/TOMORROW_DEMO.md)。只寫入專用55434展示資料庫，原開發DB不動；明天不需Docker。完整`demo:prepare`會跑驗收並重啟，請勿在上台操作中執行。

## 最終驗收與交接（2026-11-12）

目前版本維持v0.4.0。本輪停止新增業務，只驗收及修復：餐點設定404、原生日期送出、共用表格／按鈕樣式。功能與證據見 [最終清單](docs/FINAL_ACCEPTANCE.md)，完整 [ERD／字典](docs/ERD.md)、[Windows手冊](docs/WINDOWS_SETUP.md)、[六人分支指南](docs/GIT_COLLABORATION.md)、[已知限制](docs/KNOWN_LIMITATIONS.md)。

可重複展示：原生runtime與原開發DB就緒後執行 `npm run demo:prepare`；專用DB是127.0.0.1:55434／restaurant_erp_acceptance_test，前端localhost:5175，不使用現有ADMIN。每輪保留前次資料並建新前綴，密碼只存被忽略的work，不在來源或ZIP。詳細指令見Windows手冊。

國立高雄科技大學資訊管理系｜軟體工程第12組｜v0.4.0｜2026-11-12

沿用 v0.3.0 的 React／TypeScript／Vite／Tailwind、Express／TypeScript、Prisma7／PostgreSQL。七大模組已連接真實資料庫；Windows 單機為展示目標，Docker／Linux為選用。無固定展示密碼或假營收。正式簡報、ERD及功能架構附件仍未提供，依使用者需求及決策文件實作。

## 功能與路徑

| 模組       | 實際功能                                                               | 路徑                                           |
| ---------- | ---------------------------------------------------------------------- | ---------------------------------------------- |
| 使用者權限 | Argon2id、Session、CSRF、限流、RBAC、帳號新增／修改／停用／撤銷Session | /users（ADMIN）                                |
| 菜單商品   | 食材／分類／一般餐點／配方、固定套餐、選項群組、加購及額外食材         | /ingredients、/menu-items、/menu-configuration |
| 訂單銷售   | 內用／外帶／外送、價格／配方快照、折扣／服務費、付款紀錄、狀態管理     | /orders                                        |
| 庫存       | 期初、進貨、領料、耗損、盤點、補償與不可由API改寫的流水；製作時扣庫    | /inventory                                     |
| 採購供應商 | 供應商維護、申請、核准、訂購、部分／完整收貨及原子入庫                 | /purchasing                                    |
| 員工排班   | 職務／員工、班表、時間衝突、出勤／補登、請假審核                       | /staff                                         |
| 營運分析   | 真實營業額、訂單、熱銷、食材耗用、採購、排班及出勤；日期與銷售分類篩選 | /reports                                       |

ADMIN管理全部；MANAGER除帳號外管理；CASHIER查菜單、下單付款及製作狀態；KITCHEN只查菜單／配方／庫存與更新製作，不操作採購、帳號、食材／價錢或配方。所有寫入由後端驗權，不以隱藏按鈕代替。金額／食材數量使用Decimal，API十進位字串。

## Windows 啟動

需要 Node 24.11+ 的24.x、npm11與Git。根目錄執行，已有.env不覆寫。

```powershell
npm ci
npm run setup:env
node scripts/local-postgres.mjs start
npm run db:generate
npm run db:deploy
npm run db
npm run dev
```

此工作目錄已安裝 PostgreSQL 備援；全新機器需先執行：

```powershell
npm install --prefix work/postgres-runtime --no-audit --no-fund @embedded-postgres/windows-x64@17.11.0-beta.19
```

備援只操作本專案 work/local-postgres-dev／test。DB開發55432、測試55433，均只綁127.0.0.1，不重設既有資料。可以用自己安裝的PostgreSQL，設定獨立開發／測試連線；測試庫名稱必須以_test結尾。setup:env產生隨機本機密碼；不要提交.env或輸出完整連線。

前端 http://127.0.0.1:5173/login，API http://127.0.0.1:3000/api/health，Swagger /api/docs/。前端同源/api經Vite proxy轉送。分開啟動可用npm run dev:api及npm run dev:web。第一次管理員使用互動命令npm run admin:bootstrap，Email與隱藏密碼自行輸入；已有管理員不會覆寫。後續由ADMIN建立帳號。

Ctrl+C停止前後端；node scripts/local-postgres.mjs stop停止DB且保留資料。已運作時勿重複啟動。不得使用migrate reset、db push --force-reset或刪除Volume。

## 驗證與Migration

```powershell
npm run check
npm run db
npm run test
npm run test:integration
npm run format:check
```

check包含Schema驗證、TypeScript、單元／元件測試及兩端production build；不代替真實DB測試。test:integration只對明確設定的隔離TEST_DATABASE_URL套用Migration，清理自己建立的資料，不truncate。詳細結果見docs/verification/full-erp/RESULTS.json。

前3版SQL不變。新增20261112000100_full_operations建立17張業務表與12項CHECK，為既有非零庫存留基準而不改原量。db唯讀核對4版checksum、schema diff、19 CHECK及既有去重索引。新增結構只使用新Migration，先審查SQL再deploy。

## 交易規則與範圍

下單不預留；開始製作時依不可變快照扣庫，與狀態／流水／持久化冪等結果同交易。庫存不足全回滾。製作後取消不自動加庫；已付款單不能直接取消，無退款或真實金流。所有新命令使用requestKey UUID防重送。採購收貨不得超收，請假核准前須處理衝突班次。詳見docs/OPERATIONS-DECISIONS.md。

固定套餐、正價加購與額外食材已實作；巢狀套餐、負用量替換、單位換算、圖片上傳、部分付款／退款、多店、真實金流、發票硬體、總帳、薪資／報稅與AI預測不在本版範圍。基本足夠性估算不含選項，最終製作按完整訂單快照驗證。

## 目錄與協作

```text
apps/frontend/src/{api,auth,components,hooks,pages,config}
apps/backend/src/modules/{auth,users,catalog,health,operations}
apps/backend/prisma/{schema.prisma,migrations}
apps/backend/tests
scripts
docs
.github/workflows
```

operations分menu、inventory、orders、purchasing、staff、reports service，共用交易repository與HTTP routes；前端集中API與可重用表單／分頁。先由主導者完成整合，再由五位組員分支優化，同一Schema與API，不分六套專案。見docs/COLLABORATION.md。

閱讀API.md／OPERATIONS-API.md、ARCHITECTURE.md、OPERATIONS-DECISIONS.md；驗收見ACCEPTANCE／PROGRESS；展示按DEMO.md。安全與無中斷密碼輪替見SECURITY.md。不自動commit或Push。

## Docker／Linux（選用）

保留docker-compose.yml、兩端Dockerfile與Nginx。引擎正常時可改以docker compose up -d --wait postgres啟動DB，或docker compose --profile app up --build啟動完整系統。原生與Docker用相同port，先停止另一個，勿重設資料或刪Volume。Linux／容器完整執行未驗證；不阻擋Windows業務展示。
