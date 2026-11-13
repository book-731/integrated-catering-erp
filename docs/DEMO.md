# Windows 期末 Demo

## 2026-11-14組內初步展示（約5分鐘）

明天使用 [TOMORROW_DEMO.md](TOMORROW_DEMO.md) 的操作卡；`npm run demo:start`後`npm run demo:stage`，固定localhost:5175。腳本備好待收貨500g、白米1000g、120元／100g配方與備案訂單；瀏覽器主線為收貨→1500g→兩份240元→付款→製作扣到1300g→完成→分類報表。下文10分鐘與主開發5173流程保留作期末參考，請勿與明天隔離環境混用。

## 本輪可重複隔離 Demo

先依WINDOWS_SETUP準備本機，再執行npm run demo:prepare。程式經真正HTTP API建立四角色及完整食材→採購→套餐訂單→製作扣庫→付款完成→人事報表，並核對原始SQL及隔離DB重啟保存。每次新前綴，舊展示資料保留，報表會累積真實數據。

展示位址http://localhost:5175/login，專用DB55434／restaurant_erp_acceptance_test。與下文主系統5173不同；展示帳密及啟停說明見WINDOWS_SETUP，密碼不在Git或ZIP。可用同一套頁面手動重走下文流程；已有流水不重做期初，改用新食材。

## 啟動

Node24.11+（24.x）、npm11；在根目錄執行。已有.env不覆寫。

```powershell
npm ci
npm run setup:env
node scripts/local-postgres.mjs start
npm run db:generate
npm run db:deploy
npm run db
npm run dev
```

首次安裝備援前先執行 `npm install --prefix work/postgres-runtime --no-audit --no-fund @embedded-postgres/windows-x64@17.11.0-beta.19`。現有工作目錄已安裝。前端 http://127.0.0.1:5173/login，API http://127.0.0.1:3000/api/health，Swagger /api/docs/。

第一次無管理員時，在獨立終端 `npm run admin:bootstrap`，互動輸入自己的Email／隱藏密碼；不提供固定帳密。既有管理員不重設。由ADMIN新增店長、櫃檯及廚房帳號。瀏覽器不要儲存共用展示帳密。

## 約10分鐘展示路徑

1. ADMIN展示帳號／停用與權限，再以MANAGER登入。
2. 食材新增白米、g、安全庫存10；庫存管理新增OPENING 100.125與原因，查看0→100.125流水。
3. 新增主餐分類、雞腿飯100.00，配方白米2.125 g。客製化群組「辣度」0–1、選項「微辣」0.00無額外食材；加購「加飯」可填額外食材與價差。另建套餐餐點並選固定組件。
4. 建立內用訂單桌12、兩份雞腿飯、折扣5.00、服務費2.50。確認總額197.50與歷史明細。
5. 開始製作，流水扣4.250，庫存95.875；重整不重扣。記錄現金付款，再完成訂單。報表顯示197.50營業額、1單、2份熱銷。
6. 供應商新增，再申請白米10g、每g2.50；核准→訂購→收貨10。流水入庫10，庫存105.875；報表採購額25.00。測超收應失敗。
7. 建職務、員工、班表；相同時段第二班應拒絕。停用衝突班次後核准請假。登錄其他時段出勤，報表查看時數。
8. 換KITCHEN只看庫存／配方、更新製作狀態；無採購／帳號操作。換CASHIER可下單付款，不可管理食材或讀配方。縮小視窗展示手機版。

數據由以上操作真實寫入，不預植假的統計。不要在有既存庫存的食材重做OPENING；後續補貨或盤點須留原因。已付款單不直接取消，製作後取消不自動回庫。

## 展示前檢查與停止

```powershell
npm run check
npm run db
npm run test:integration
```

準備前先用管理者確認日期、資料、角色；固定用127.0.0.1:5173，勿混用localhost以免Cookie／Origin不同。已啟動服務不用重複啟動。Ctrl+C停止前後端；`node scripts/local-postgres.mjs stop`停止DB且保留資料。不執行reset、清空或刪除volume。
