# Windows 安裝、啟動與復原手冊

2026-11-14組內初步展示優先使用 [5分鐘Demo操作卡](TOMORROW_DEMO.md)：已安裝的本機只需`npm run demo:start`及`npm run demo:stage`，網址localhost:5175，不需要啟動開發55432或Docker。以下完整安裝步驟供新機器使用。

需求：Node24.11以上的24.x、npm11、Git；Windows本機。使用專案根目錄的PowerShell，路徑有空白請以引號包住。

## 全新機器

```powershell
npm ci
npm run setup:env
npm install --prefix work/postgres-runtime --no-audit --no-fund @embedded-postgres/windows-x64@17.11.0-beta.19
node scripts/local-postgres.mjs start
npm run db:generate
npm run db:deploy
npm run db
npm run dev
```

setup:env只在.env不存在時產生隨機資料庫密碼；已有設定不覆寫。開發DB55432、一般整合測試DB55433，work下資料保留。不得用reset、truncate、drop或刪Volume處理啟動問題。

主系統 http://127.0.0.1:5173/login，API http://127.0.0.1:3000/api/health，Swagger /api/docs/。不要把localhost與127.0.0.1混用，Cookie與Origin按位址區分。已有帳號直接登入；初次沒有ADMIN時執行npm run admin:bootstrap，輸入完整Email與兩次12–128字元隱藏密碼。沒有固定預設密碼，既有管理員不會被覆寫。

## 隔離展示／重複驗收

原生runtime及開發DB準備好後：

```powershell
npm run demo:prepare
```

此命令建立／沿用專用PostgreSQL **127.0.0.1:55434／restaurant_erp_acceptance_test**，API3004、前端 **http://localhost:5175/login**。建立四角色、每次以新前綴經真實API建立一輪完整資料並檢查；不刪舊展示資料。完成後專用環境保持運行，方便手動展示。

展示Email：admin@team12-demo.example.test、manager@team12-demo.example.test、cashier@team12-demo.example.test、kitchen@team12-demo.example.test。這些只是隔離帳號，不能登入主系統。密碼隨機產生在本機被Git忽略的work/acceptance-demo/private.json之accountPassword欄位；僅本人在本機檢視，勿貼聊天、截圖或上傳。ZIP不包含此檔，也沒有固定展示密碼。新機器會產生自己的密碼。

```powershell
npm run demo:stop
npm run demo:start
npm run demo:restart
npm run test:acceptance
```

stop只停止專用展示程序並保留資料；start在已停止後使用；restart僅重啟專用資料庫與服務。test:acceptance與demo:prepare同為可重複的完整HTTP＋重啟驗證。短時間大量重跑可能觸及真實登入限流，應遵守Retry-After等候，不停用限流或清空安全資料。

2026-11-13補充：`demo:start`已修成可安全重複啟動，會驗證程序所有權、沿用存活的Demo程序；部分失效請用`demo:restart`。新增`demo:stage`保留適合5分鐘操作的待收貨採購單、庫存與備案訂單。stage與start不依賴開發DB；完整prepare仍會唯讀比對開發資料，需原開發DB在線。環境安全設定由隔離腳本明確注入，並同時檢查API、前端與/api代理。

## 一般驗證

```powershell
npm run check
npm run db
npm run test
npm run test:integration
npm run format
```

check含型別、Schema、一般測試與Build；test:integration只用TEST_DATABASE_URL且名稱須以_test結尾。npm run db唯讀驗證結構／checksum，不套Migration。需加表時新增Migration，不修改已套用SQL。

## 關閉與常見問題

主開發程序Ctrl+C；node scripts/local-postgres.mjs stop停止開發／一般測試PostgreSQL但保留資料。請勿以此停止正在使用的資料庫而不先協調。專用展示只用demo:stop。

連接埠占用：先確認是哪個程序，不自動殺掉不明程序。展示工具遇所有權或port不符會停止，不取代別人的資料庫。找不到native runtime依上方固定版本安裝；不要刪既有資料目錄重新初始化。Docker可選用，與原生55432／55433不能同時占同port；Linux及遠端CI不屬本輪驗收。

密碼錯誤請確認登入的是主系統還是隔離展示。管理員密碼不可從Argon2id反解；若主帳號遺失密碼，應走授權的安全重設並撤銷Session，不能刪DB或換資料庫帳密當作重設登入密碼。
