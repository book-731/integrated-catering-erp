## 餐點照片後端本機上傳與讀取 API（2026-11-17，Asia/Taipei）

依餐點照片上傳與存檔設計規格及實作計畫，完成後端本機圖片儲存與 API 端點：

- 模組架構：新增 `MenuImageStorage` 處理魔術位元組安全驗證（JPG、PNG、WebP）、UUID 檔名生成、路徑穿越防護及目錄管理。支援獨立目錄注入，預設使用 `work/uploads/menu-items/`。
- CSRF 防護通用化：重構 `protectCsrfFor`，支援非 JSON 的二進位 Content-Type 檢驗（`image/jpeg`、`image/png`、`image/webp`），同時維持既有 `application/json` 嚴格防護。
- API 端點與生命週期：實作 `POST /api/menu-items/:id/image`（二進位上傳、2MB 限制、新圖自動取代舊圖）、`DELETE /api/menu-items/:id/image`（刪除本機圖檔並設 `imageUrl` 為 null）、`GET /api/menu-items/images/:filename`（四角色登入讀取、inline 與 private 快取 Header）、以及 `PATCH /api/menu-items/:id` 變更圖片時自動清理舊圖機制。
- OpenAPI 與真實 PostgreSQL 整合測試：更新 `catalog.openapi.ts`（移除 `imageUrl` 的 `format: 'uri'` 限制、補齊三端點與錯誤碼宣告）；新增 `catalog-image.integration.test.ts` 完整覆蓋四角色權限、魔術位元組防偽、2MB 上限、路徑穿越與生命週期，全數通過且未污染 `work/uploads`。

## GitHub首次上傳準備（2026-11-13，Asia/Taipei）

依使用者新指示，解除「不自行Push」對這次上傳的限制。目標為book-731/integrated-catering-erp（原Nkust-IM-SE-group12網址已轉址），使用者選定andy1215666，協作者寫入權限與本機CLI登入已確認；遠端目前為空倉庫。本次以codex/erp-v0.4.0-initial-upload作為初始分支，保留v0.4.0及既有Demo資料，不新增業務功能。

提交範圍包含前後端來源碼、4版Migration、測試、套件鎖定檔、Docker／CI、安全範例及文件；排除.env、真實密碼、node_modules、generated、work、outputs、資料庫實體資料與暫存。上傳前重新核對實際暫存檔案及機密掃描；既有169項Vitest、22項HTTP驗收、13項瀏覽器檢查見verification/tomorrow-demo。這些是本機驗證，不預先宣稱GitHub Actions通過；原開發非UTC時間風險仍依KNOWN_LIMITATIONS處理。

本節記錄上傳準備，實際推送結果以GitHub遠端分支與commit為準，不變更任何帳號、密碼或資料庫。

## 明日5分鐘Demo穩定性準備（2026-11-13，Asia/Taipei）

停止新增業務。閱讀README、WINDOWS_SETUP、DEMO、FINAL_ACCEPTANCE及全部acceptance腳本，實測start／stop／restart／prepare。修正start在既有Demo運行時錯誤退出，驗證程序所有權後安全沿用；ready同時檢查API、前端及/api代理。明確注入Demo Session、限流、Origin與前端代理設定，新增demo:stage透過真實API建立／沿用5分鐘資料，保留舊記錄，不重設庫存。

重要新發現：台北午夜後報表SQL與API不符，初次誤判只需調整SQL，重跑仍失敗；確認adapter-pg在非UTC連線錯存／錯讀timestamptz。僅Demo connection startup options固定UTC，不修改主.env、主開發服務或既有資料。還原正確timestamptz參考SQL，加入資料庫epoch與API時間一致、接近現在、UTC／Asia/Taipei兩種session午夜邊界檢查。失敗及最終成功都保留在verification/tomorrow-demo/results.json。

本輪check（Schema／TS／112項一般測試／Build）、db（4版Migration／19 CHECK）、真實PostgreSQL57項、修正後demo:prepare22／22均exit 0，既有169項保留。服務停止後啟動、重複start、restart、23張穩定表保存通過；原開發帳號／業務資料指紋前後一致。demo:stage連續執行沿用同前綴且穩定表不變。未實際重開整台Windows，僅測服務完整停止／啟動與資料保存。

UTC修正後瀏覽器重走ADMIN收貨500g→庫存1000增至1500g→CASHIER新增240元並記錄現金→KITCHEN查看200g快照／開始製作→庫存1300g→完成→MANAGER分類報表480元／2單；13項瀏覽器檢查通過，包括廚房採購403、新批次就緒及登出。瀏覽器訂單時間與資料庫epoch核對通過。已知機密比對0，Cookie／CSRF／限流及Git忽略檢查通過。

明日未消耗批次DEMO-20261113-48781f：白米1000g、待收貨500g、120元／100g配方、待處理及已完成240元備案各一張。55434／API3004／localhost:5175保持運行，瀏覽器登出並保留登入頁。新增TOMORROW_DEMO.md（展示日2026-11-14）、離線真實截圖outputs/tomorrow-demo/index.html；相關啟動文件及限制清單同步更新。

原開發環境的非UTC時間風險仍需展示後另做唯讀盤點、備份及核准修復；未盲目回填時間、改DB密碼、重設、清空、刪Volume或Push。明天只使用隔離UTC Demo，舊驗收ZIP不包含本次修正。

## 管理員建立工具維護（2026-11-12）

**本輪最終：Vitest 169／169（後端74、前端38、PostgreSQL57），HTTP營運／重啟22／22，桌面七模組與手機八頁通過。check、db、兩次test、format、test:integration、test:acceptance及format:check最終皆exit 0。原167案例保留；不重複加總重跑次數。**

## v0.4.0 最終全面驗收（2026-11-12）

停止新增ERP業務。審查實際模組、Schema／四版SQL、前後端測試與權限；新增可重複的隔離展示／HTTP營運／重啟工具，不依賴舊outputs或Git內部資料即可從審查ZIP執行。修正configuration的500→404、datetime-local送null、共用表格／按鈕樣式；新增回歸並以瀏覽器重測。

21項真實HTTP情境＋真正隔離API／PostgreSQL重啟保存已通過；桌面七模組與手機八頁、跨角色下單／付款／製作／完成、排班衝突與保存已實測，前後開發帳號／資料指紋相同。最終全套命令以docs/verification/acceptance-final/RESULTS.json為準。新增FINAL_ACCEPTANCE、ERD、WINDOWS_SETUP、GIT_COLLABORATION、HANDOFF_ARCHITECTURE及KNOWN_LIMITATIONS。版本不變，未清空、重設、刪Volume、輪替DB密碼或Push。

唯讀確認本機開發庫原本沒有ADMIN及其他使用者，未變更ERP業務資料。修正bootstrap-admin把VALIDATION_ERROR誤報為管理員／Email衝突的問題；互動模式現在即時驗證完整Email、12–128字元密碼、隱藏輸入與二次確認，格式不符原地重試。原有Argon2id及bootstrapAdmin交易流程不變，沒有新增預設密碼或重設資料庫。

已執行後端TypeScript檢查與74項測試，皆通過；另用互動PTY實測無效Email與短密碼提示，測試在寫入前中止，沒有建立測試帳號。使用者已完成本機互動設定；CLI exit 0，唯讀核對一位已啟用ADMIN且Argon2id=true，前後ERP業務資料筆數相同。未重設或刪除資料庫，未讀取或輸出明文密碼；文件不記錄Email、密碼或雜湊。

# 最新：v0.4.0 七大模組本機整合（2026-11-12）

**最終結果：167／167通過（後端74＋前端37＋真實PostgreSQL56），保留原131案例。check、db、test、test:integration、format:check及Compose解析全部exit 0。即時前端／API／DB通過，4版Migration與原3版SQL雜湊核對通過；機密比對0筆。**

開發前重跑v0.3.0：check含64後端＋31前端及Build通過，DB36通過，共原131項。沿用實際程式、既有4個目錄模型與登入安全機制，不重建、不等待六份API。

新增固定套餐／選項、庫存流水、訂單及價格／配方快照、付款記錄、原子扣庫、供應商與採購部分收貨、職務／員工／班表／出勤／請假、真實報表及UI。第4版加法Migration已套用開發與隔離測試DB；不重寫前3版、不清空既有DB。瀏覽器實際走通期初100.125→銷售扣4.250→收貨加10，核對存量105.875與流水一致；營收197.50、採購25.00來自實際操作，非固定值。一次性測試資料／帳號已清理。390px手機無水平溢位，保存畫面於outputs/full-erp。

最終自動化命令與退出碼以docs/verification/full-erp/RESULTS.json為準；不要以舊階段測試數推定本版。開發策略與合理預設記錄於COLLABORATION、OPERATIONS-DECISIONS，展示見DEMO。保留Docker但不以未驗證容器阻擋Windows展示。未push，未修改既有密碼。

以下為歷史階段紀錄。

# 開發進度與驗證紀錄

## 歷史：第二階段 B（2026-11-10，v0.3.0）

僅完成食材、菜單分類、一般餐點與配方管理，保留第一階段／第二階段 A，未重建專案。正式簡報／功能圖仍未提供，依使用者需求與既有 Schema；最新明確確認的廚房權限已納入 PHASE2B-DECISIONS。

- 開發前重跑 check 與 DB 整合，原 56 項全部通過；保存來源／Migration／業務表筆數基準於本機 work，無機密輸出。
- 沿用四個既有目錄表及多對多關聯，只加第三版 Migration：分類 isActive、餐點 recipeVersion、正規化唯一索引及版本 CHECK。前兩版 SQL 未變，沒有 reset 或清空 DB。
- 食材可新增、修改、搜尋、單位／狀態／低庫存篩選、分頁、停用／啟用。安全庫存採 Decimal，現有庫存唯讀，新增固定零；額外 stockQuantity 輸入直接 422。期初與流水待後續。
- 分類可新增、改名、查詢與停用，名稱忽略大小寫及空白唯一；不硬刪除被使用分類，也不連帶刪除餐點。
- 一般餐點可新增、編輯、停用／啟用、供應設定、圖片 URL、分類／狀態搜尋及分頁；價格用固定精度十進位字串。套餐、複雜客製化與圖片上傳尚未開發。
- 配方可新增列、改量、移除、查詢完整關聯；重複食材、零／負用量、錯配單位皆被後端拒絕。食材已有配方或非零庫存不能換單位，停用保留歷史關聯。
- PUT expectedVersion 原子替換；同一交易驗權／狀態／單位後更新列與版本。相同舊版本併發只有一筆成功；插入階段真實 DB 失敗時，已刪除列及版本全 rollback。GET 採一致快照。
- ADMIN／MANAGER 管理；CASHIER 只讀菜單／分類；KITCHEN 依使用者後續確認可讀配方與食材庫存／安全庫存／提醒，非讀取操作一律後端驗權拒絕。庫存 DTO 白名單，無採購價／供應商資料，無採購／使用者管理權。
- KITCHEN 可讀取食材足夠性：GET 指定 1–10000 份，以 Decimal 算需求、現有／不足量；Repeatable Read + READ ONLY，不保留、不扣庫、不建立訂單。
- 前端四介面皆真實 Fetch／PostgreSQL，重用 Layout／Dialog／搜尋／分頁與錯誤狀態。分類選項會逐頁取得，不靜默截斷 100 筆；配方食材可分頁查詢。
- 本次一般測試後端 64＋前端 31＝95；DB 整合 36，合計 **131 項不同測試**，保留原有 56。原登入導覽測試只更新「六個待開發」為四個，並驗已開放菜單路由，未刪除或放寬安全測試。
- 真實瀏覽器驗證 CRUD、配方加／改／移／重讀、單位鎖定、停用分類與餐點保留配方；四角色、廚房唯讀庫存／份數查詢、1280 桌面與 390 手機無 body 橫向溢位。手機表格在容器內捲動。
- 隔離驗收帳號、關聯 Session、目錄資料與暫存密碼均已清理；臨時 API 3002／前端 5174 已停止。開發 DB 只套用加法 Migration，沒有植入永久帳號或示範庫存。
- 新唯讀 db 工具核對三版 checksum、Schema、7 項 CHECK 與 3 個去重索引，保留原四約束測試。
- 最終 check、db、test、integration、格式、安全掃描與實際 exit code，見 verification/phase2b/RESULTS.json。安全 ZIP 以 outputs/phase2b/review/ZIP_VERIFICATION.json 的逐檔 SHA-256／CRC／機密檢查結果為準。

README、API、ARCHITECTURE、ACCEPTANCE、SECURITY、REVIEW_GUIDE 已更新；新增 PHASE2B-DECISIONS 與 NEXT_ORDER_INVENTORY（僅設計）。本次沒有訂單、採購、排班或庫存異動 API／資料表，未 commit／push。

Docker 保留原生 PostgreSQL 備援，不 reset 或刪 volume。正式 HTTPS、Linux 容器與遠端 CI 未實測；正式附件、其他模組詳細權限仍待提供。後續需先確認訂單狀態／扣庫／取消規則，再建立訂單快照、庫存流水及冪等命令。本次停在第二階段 B，等團隊驗收。

---

## 歷史：第二階段 A（2026-11-10，v0.2.0）

本次僅完成登入與角色權限。正式簡報／功能架構圖未在目錄找到，依使用者訊息及既有 Schema 開發；政策與待確認見 PHASE2A-DECISIONS。

已完成：

- Argon2id 真實登入與登出，四角色 ADMIN／MANAGER／CASHIER／KITCHEN。
- PostgreSQL Session、256-bit 隨機 token、DB 僅存 SHA-256、登入輪替；HttpOnly／SameSite Cookie，HTTPS 採 Secure 與 __Host-。
- 同步 CSRF token、明確 Origin、JSON；登入亦受保護。持久化 IP／帳號限流及 Retry-After。
- 後端 requireAuthenticated／requireRoles 與管理交易內再驗權；僅 ADMIN 有使用者管理權。
- 帳號新增、修改、停用、啟用，搜尋／角色／狀態篩選與分頁；敏感欄位變更同一交易撤銷所有 Session。
- 禁止停用／降權自己並保留啟用 ADMIN；處理登入驗證後被停用、併發管理寫入與 Session 重用。
- React 登入頁、登入狀態、受保護路由、角色導覽、管理表單／對話框、Loading／Empty／Error。其餘六模組仍明示待開發。
- 安全帳號 bootstrap：隱藏輸入或程序環境注入，不固定密碼、不覆寫既有管理員；production 禁用。
- 新 Migration 20261110000200_auth_sessions 已套用開發／測試 DB，初始 SQL 與原有測試檔未修改，沒有 reset。
- 更新 README、API、ARCHITECTURE、ACCEPTANCE、SECURITY、REVIEW_GUIDE 與決策文件。舊第一階段 ZIP 是歷史快照。

本次修復與驗證：

- 修正 TypeScript 發現的 Fetch body 重複宣告、測試 Cookie header 可空型別。
- 真實 DB 找出 advisory lock 的 void 回傳值無法被 Prisma 解析，改明確 text cast。
- 實際 HMR 發現 context 重建問題，分離 Provider 與共享 context。
- 修正自己姓名時成功提示因 refresh 卸載而消失，改背景刷新並加回歸測試，保留搜尋條件。
- 後端一般測試 27、前端 15、真實 DB 整合 14，合計 **56 項不同測試**，包含原有 19 項。重複執行不累加；最終命令及 exit code 以 verification/phase2a/RESULTS.json 為準。
- 瀏覽器以隔離 DB 一次性隨機帳密驗證：真實登入、首頁 DB up、七導覽／六待開發、帳號清單、自己姓名修改、成功提示、搜尋空白、手機導覽、登出與保護路由。1280／390 寬度無 body 橫向溢位；手機表格可橫向捲動。
- CLI 實測首位管理員／Argon2id、重複建立拒絕、production 拒絕、無密碼輸出；本次測試帳號已清除。
- 原生 PostgreSQL 55432／55433 正常；兩版 Migration checksum 相符，Schema 無差異，原四 CHECK 保留。五張業務表開發／測試均為 0，與本次初始狀態一致。
- .env 忽略且未追蹤；可提交檔及 frontend build 的目前 DB 憑證比對為 0，無 VITE 機密，未改 DB 密碼、未 commit／push。
- Compose 設定重新解析通過；Docker 引擎、Linux 容器與遠端 CI 仍未驗證成功。

交付停在第二階段 A。前端 5173、API 3000 及原生 DB 備援維持運行；本次隔離驗收 5174／3002 已停止，暫存帳密已清除。開發 DB 沒有植入固定帳號，請依 README 用 npm run admin:bootstrap 自訂首位管理員。

下一階段先核對正式附件／其他模組權限，再實作食材及餐點／配方 CRUD。訂單、扣庫、採購與排班本次未開始。上線前另補 HTTPS 實測、過期驗證資料清理、登入事件稽核及 Docker／Linux 驗證。

---

## 第一階段歷史

下文「尚未登入」等描述只適用當時版本。

更新日期：2026-11-10（Asia/Taipei）｜目前版本：0.1.0

最新狀態：第一階段驗收與必要修復完成，19 項測試通過；Docker 實際容器執行仍未驗證。逐項結果見 [ACCEPTANCE.md](ACCEPTANCE.md)，安全與輪替方法見 [SECURITY.md](SECURITY.md)。

最後驗收補充：指定三個命令及真實 DB 整合已再次通過；HTTP／資料庫正常。本次內嵌瀏覽器因 ERR_NETWORK_IO_SUSPENDED 無法重新完成畫面驗收，並非本次通過項目。審查封裝與本輪證據見文末及 `docs/verification/`。

## 第一階段範圍

第一階段程式、文件與本機驗證已完成；Docker 執行驗證受環境阻擋，明確列於下方。只進行第一階段，交付後停止，等待團隊檢查。

## 專案檢查

- 初始工作目錄為空，沒有既有程式碼或 Git 儲存庫，沒有覆蓋或刪除既有成果。
- 未提供簡報、功能分解圖、ERD、需求文件或其他附件，沒有宣稱已閱讀。
- 環境：Windows、PowerShell、Node.js 24.11.0、npm 11.6.1、Git 2.51.2。

## 已建立

- npm workspaces 前後端分離架構，React + TypeScript + Vite + Tailwind + Router。
- 繁體中文 Sidebar、Header、Dashboard、響應式導覽與七大未開發模組頁。
- 集中 Fetch client、Zod 回應驗證、timeout、取消舊請求、Loading／Error／Success／重試。
- Express + TypeScript，Routes／Controller／Service／Repository 分層。
- 真實 `GET /api/health` → Prisma → PostgreSQL `SELECT 1`。
- 統一 JSON 錯誤、Request ID、Helmet、CORS、body 上限、graceful shutdown。
- Swagger UI 與 OpenAPI 3.0.3。
- PostgreSQL 17 Compose、隔離測試 DB、API／前端 Dockerfiles 與 Nginx、app profile 依序 migration／API／前端啟動。
- Prisma 7 pg adapter、schema 與初始 Migration：User、Ingredient、MenuCategory、MenuItem、RecipeIngredient；含 CHECK constraints。
- `.env.example`、隨機密碼初始化工具、`.gitignore`、lockfile、README、架構／API 文件。
- 前端 Vitest／Testing Library、後端 Vitest／Supertest、真實 PostgreSQL 整合測試與 GitHub Actions。
- Windows PostgreSQL 原生備援工具，限本專案 work 目錄，不更換資料庫、不修改系統服務。

## 首次建置驗證紀錄（歷史）

| 項目                                | 結果與範圍                                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| npm install                         | 已成功，npm audit 顯示 0 vulnerabilities                                                            |
| Prisma generate / validate          | 已通過                                                                                              |
| 前後端 TypeScript                   | 已通過                                                                                              |
| 後端 HTTP 契約測試                  | 8 / 8 通過；repository 注入測試，不計為 DB 整合                                                     |
| 前端元件／API 狀態測試              | 5 / 5 通過                                                                                          |
| 前後端 production build             | 已通過；路由使用 lazy import，消除單一 chunk 過大的警告                                             |
| 真實 PostgreSQL migration／整合     | PostgreSQL 17.11，開發與獨立測試 DB 均套用 1 版 migration；3 / 3 整合測試通過                       |
| 前端瀏覽器實測                      | 1440×1000 桌面、390×844 手機；Dashboard、重試、未開發模組、手機選單與自動關閉皆通過，手機無橫向溢位 |
| 真實資料庫停止／恢復                | 停止時 HTTP 503 DATABASE_UNAVAILABLE，前端顯示 API 已回應／資料庫連線失敗；恢復後重新檢查回到正常   |
| Swagger 瀏覽器操作                  | 經 Vite Proxy 載入文件，Try it out / Execute 呼叫 health 得到真實 HTTP 200                          |
| Docker Compose config               | 可解析                                                                                              |
| Docker 引擎／映像建置／Compose 啟動 | 環境阻擋，未驗證成功                                                                                |
| GitHub Actions 遠端執行             | 尚未執行，無 remote、無 push                                                                        |

第一次 Supertest 執行因沙箱阻擋 loopback，回報 EACCES；允許本機連線後原測試 8 / 8 通過。此為執行環境限制，未修改測試以掩蓋錯誤。

Docker Desktop 畫面顯示 unexpected error：初始化 Inference manager 時 `dockerInference` socket 無法存取；Linux engine named pipe 不存在。啟動服務也失敗。未進行 factory reset、刪除 Docker 檔案或變更安全設定。Compose 與 Dockerfiles 保留，待環境修復後驗證。

資料庫驗證使用放在專案 work 內的 PostgreSQL 17.11 原生程序，資料仍是 PostgreSQL，不是 mock／SQLite／PGlite。整合測試涵蓋真實 health、配方關聯與 Decimal、交易 rollback、負庫存與零用量約束。測試寫入均 rollback，不建立業務示範資料。

已另以 production 模式啟動編譯後的 `dist/server.js`（驗證用 port 3001），實際 health HTTP 200。開發與測試資料庫五張業務表的資料筆數皆為 0，確認測試沒有殘留資料；兩個資料庫各有 1 筆成功 migration。HTTP、版本與筆數的原始紀錄存放於 `outputs/verification-results.json`，不含資料庫 URL 或密碼。最終建置與格式檢查均通過，沒有 chunk 大小警告。

已儲存桌面與手機截圖於 outputs。預覽與資料庫在交付前停止，資料保留；重新啟動方式見 README。Git 已初始化 main 分支，未 commit、未設定 remote、未 push。

## 尚未實作

七大業務模組均尚未提供操作 API 或資料畫面。登入／登出、密碼雜湊、RBAC、帳號停用、食材 CRUD、菜單配方 CRUD、訂單、庫存扣減、異動流水、銷售報表、採購、排班皆待後續階段。現有資料表不代表上述功能已完成。

尚未提供業務表格、搜尋／篩選、CRUD 對話框與表單驗證；應與各業務 API 一起實作，本階段不放置無作用按鈕或假營運數據。沒有 seed 帳密。

## 待確認與風險

- 正式附件未取得；目前 schema 與權限／訂單規則為初版，需對照正式 ERD。
- Docker 完整執行尚待本機環境修復，原生 PostgreSQL 驗證不能取代 Linux 容器驗證。
- health 只驗證連線，不檢查 migration 版本，需另執行 `db:status`。
- CHECK constraints 手寫於 migration SQL，後續修改需保留並跑整合測試。
- 後端 runtime Docker image 尚保留開發依賴，正式部署前縮減；尚無 HTTPS、完整登入與營運資料權限。
- `.env` 不入 Git；開發資料庫與測試資料庫獨立，不執行 reset 或刪除既有資料。

## 下一階段建議（尚未開始）

1. 團隊檢查本階段，提供簡報／ERD，確認角色權限與庫存扣減／取消規則。
2. 完成 Argon2id 登入、session、登出、後端 RBAC、停用帳號與測試。
3. 完成食材、餐點／分類與配方 CRUD，前後端表單驗證及權限測試。
4. 以 transaction、條件狀態更新、唯一鍵與 Idempotency-Key 實作訂單扣庫；測併發、重送、庫存不足與取消。
5. 完成不可任意修改的庫存流水與每日／每月／自訂日期銷售報表，再擴充採購與排班。

業務政策草案與待確認清單詳見 ARCHITECTURE。本次不進入上述開發。

## 第一階段再次驗收與必要修復（2026-11-10 下午，Asia/Taipei）

本次直接閱讀實際 Routes／Controller／Service／Repository、前端 Fetch／hook／layout、Prisma Schema／SQL、Dockerfiles、Compose 與啟動腳本，沒有只依 README 判定。

- 11 項必要路徑完整；Node 24.11.0／npm 11.6.1 符合 engines。
- 實際 `npm ci` 成功，lockfile 無變更；npm audit 顯示 0 vulnerabilities。
- 原 `npm run db` 實際失敗，原因是缺少 script；已修復為唯讀資料庫完整性檢查。
- `npm run db`、`npm run typecheck`、`npm test`、`npm run build`、`npm run check`、資料庫啟動後的 `npm run test` 全部通過。
- `npm run test:integration` 通過；一般測試後端 11＋前端 5，真實 DB 整合 3，共 19 項，不把重複執行累計成更多測試。
- Schema diff 無差異，1 版已套用 migration checksum 相符，4 項 CHECK 約束一致，未更動已套用 SQL。
- 修正 CHECK 測試只判斷一般 throw 的弱點，現在要求指定約束名稱，且意外接受無效數值時也強制 rollback；已重跑整合測試通過。
- PostgreSQL 備援暫存密碼檔只在本次成功建立時清除，不刪除原本存在的同名檔。
- CI 移除固定測試密碼，改用每次隨機產生並 mask；YAML 格式檢查通過，遠端 CI 執行仍未測試。
- `.env` 與本機變體被 Git 忽略；沒有已追蹤機密檔、沒有目前憑證出現在可提交檔案；未修改 `.env`、未輪替既有資料庫密碼。
- 真實前端 Proxy、開發 API、編譯後 API、Swagger／OpenAPI 均 HTTP 200。
- 用獨立 API 程序連向不可用的資料庫位址，得到 503 DATABASE_UNAVAILABLE；沒有停止既有資料庫，錯誤回應不包含密碼。
- 瀏覽器逐一走訪七大模組，均明示未開發；桌面／手機、重試新 request ID、手機導覽自動關閉、無橫向溢位皆通過。
- Docker Compose config 可解析；Docker Desktop start 回覆已執行，但引擎查詢逾時，不能宣稱已修復。映像建置、完整 Compose 啟動與 Linux 容器端到端仍未測試。

本次保留前端 5173、開發 API 3000、原生 PostgreSQL 開發／測試 55432／55433，供使用者實際驗收；臨時的離線驗證 API 已停止。這與首次建置後關閉預覽的歷史狀態不同。兩個資料庫的五張業務表仍為 0 筆，測試未殘留資料，沒有 reset、沒有刪除 volume、沒有改帳密、沒有 push。

可在 PostgreSQL 備援上開始下一階段本機開發，但這不是正式上線驗收。Docker／Linux 部署尚待修復後驗證，正式 ERD 與權限／庫存規則仍需團隊確認。本次未新增任何 ERP 業務模組。

## 最後驗收與審查 ZIP（2026-11-10 晚間）

- 重新檢查實際前端、後端、Prisma Schema／SQL、API、啟動工具與測試，未新增或修改業務功能。
- 重新執行 `npm run check`、`npm run db`、`npm run test`，全部 exit 0；另重跑 `npm run test:integration`，3／3 通過。
- 後端一般測試 11、前端 5、真實 DB 整合 3，共 19 項；check 含型別與前後端 production build。
- Schema／資料庫 diff 無差異、Migration checksum 與四項 CHECK 一致；未變更 Schema 或已套用 SQL。
- React 首頁、前端 Proxy、Express health 與 OpenAPI HTTP 200；PostgreSQL 17.11 開發／測試連線正常，資料無殘留。
- Docker info 查詢再次逾時，Compose config exit 0；保留原生備援，不重設 Docker 或資料庫，不刪 volume。
- 本次內嵌瀏覽器重新載入因 ERR_NETWORK_IO_SUSPENDED 被阻擋，明確列為未完成；未用前次畫面冒充本次驗證。
- `.env` 被忽略且未追蹤，安全輪替提案保留於 SECURITY；未改密碼、未輸出真實憑證、未 push。
- 建立 `outputs/review/team12-restaurant-erp-phase1-review.zip`，包含審查導引、原始碼、設定、Schema／Migrations 與本輪命令紀錄。
- 封裝後重新開啟逐檔核對清單／SHA-256、CRC、禁止路徑與機密內容，交付以 `outputs/review/ZIP_VERIFICATION.json` 的 passed 狀態為準。

可準備第二階段本機開發；全面驗收仍須補 Docker／Linux 及本次畫面重驗。未開始任何新業務模組。前端、API 與兩個 PostgreSQL 備援維持既有運行狀態。
