# 最新：5分鐘Demo補驗（2026-11-13）

明天2026-11-14採用專用UTC Demo，啟動與操作卡見TOMORROW_DEMO。check、db、PostgreSQL57項、HTTP／重啟22項通過；169項既有測試保留，13項瀏覽器檢查通過。命令／兩次已解決的失敗／就緒批次／安全核對見verification/tomorrow-demo。

**新發現優先：adapter-pg在非UTC連線下的timestamptz時間偏移。** Demo連線已固定UTC，驗證真實資料庫epoch與API、午夜邊界及新展示批次；原開發環境與舊資料不回填，仍需另外核准修復。因此下列歷史「全通過」不能代表原開發時間問題已處理。沒有實際重開整台Windows，已測專用服務完整停止／啟動與保存。

# 歷史：v0.4.0 本機整合驗收（2026-11-12）

**本輪最終：Vitest 169／169（後端74、前端38、PostgreSQL57），HTTP營運／重啟22／22，桌面七模組與手機八頁通過。check、db、兩次test、format、test:integration、test:acceptance及format:check最終皆exit 0。原167案例保留；不重複加總重跑次數。**

## 本輪最終驗收（2026-11-12）

以FINAL_ACCEPTANCE及docs/verification/acceptance-final為最新依據。首次實測找到404及日期欄位問題，已修正並新增回歸案例；不是只依README或以舊167項紀錄宣稱完成。本輪實際命令與退出碼以RESULTS.json為準；兩次test不重複加總。隔離DB55434，不重設原DB、不改已套用Migration、不Push。

**最終結果：167／167通過（後端74＋前端37＋真實PostgreSQL56），保留原131案例。check、db、test、test:integration、format:check及Compose解析全部exit 0。即時前端／API／DB通過，4版Migration與原3版SQL雜湊核對通過；機密比對0筆。**

原131項測試基準已先通過。最新命令、退出碼與新測試數見docs/verification/full-erp/RESULTS.json；瀏覽器證據見browser.json。已實測新業務UI保存、真正PostgreSQL、快照、扣庫、付款及報表、採購收貨、供應商、人事主檔與客製化，桌面與390px手機。隔離資料已精準清理，沒有重設資料庫或刪volume。

實作範圍與限制見OPERATIONS-DECISIONS、完整操作見DEMO。Docker／Linux與遠端CI未測試，不屬Windows單機展示必要條件。正式簡報／ERD仍未收到。先完成整合再交五位組員優化；本次不自行push。下面保留各舊階段驗收，舊的未開發／19、56、131項為歷史紀錄，不代表目前版本。

# 驗收報告

## 歷史：第二階段 B — 食材、分類、餐點與配方

版本 0.3.0｜2026-11-10（Asia/Taipei）。本機實作與瀏覽器驗收已完成；最終指令實際結果由 verification/phase2b/RESULTS.json 與日誌核對。

### 驗收結果

| 項目                          | 結果                   | 證據                                                                       |
| ----------------------------- | ---------------------- | -------------------------------------------------------------------------- |
| 原架構與 56 項回歸            | 通過                   | 開發前 check＋integration 56／56，完成後全部保留                           |
| 沿用 Schema／關聯             | 通過                   | 未重建既有四表；只新增第三版加法 Migration，前兩版 checksum 不變           |
| 食材 CRUD／搜尋／狀態／分頁   | 通過                   | HTTP／DB 與真實瀏覽器新增／編輯；SKU 去重、停用保留                        |
| Decimal 與單位                | 通過                   | 金額／數量字串、正精度、零／負數／溢位／number 拒絕；單位完全一致          |
| 庫存唯讀                      | 通過                   | POST／PATCH stockQuantity 422，UI 無期初輸入，配方及足夠性查詢不改庫存     |
| 分類關聯保護                  | 通過                   | 去重、停用保留餐點，無硬刪 API，Restrict FK 保護                           |
| 一般餐點管理                  | 通過                   | 分類、價格、圖片 URL、供應設定及停用，原資料／配方保留                     |
| 配方新增／改量／移除／查詢    | 通過                   | 多對多、重複拒絕、>0、unit 核對，停用關聯可讀                              |
| 配方原子性與併發              | 通過                   | 舊版本兩筆只一成功；刪舊列後 DB 插入溢位仍 rollback 並保留原版本           |
| 未登入／讀寫角色隔離          | 通過                   | 401；CASHIER／KITCHEN POST／PATCH／PUT 被後端拒絕，廚房 DELETE 亦 403      |
| KITCHEN 唯讀庫存與低庫存      | 通過                   | 團隊選項②確認；GET 允許，無敏感採購／供應商欄位；無使用者管理權            |
| 食材足夠性唯讀查詢            | 通過                   | Decimal 算份數與不足量；READ ONLY，canPrepare／reservation=false；櫃檯 403 |
| 前端真實 API、狀態及響應式    | 通過                   | 31 前端測試；瀏覽器 CRUD／角色／空白狀態，1280／390 無 body 溢位           |
| Migration／實際 DB 完整性     | 通過                   | Schema 無差異、3 版 checksum、7 CHECK、3 functional unique indexes         |
| 機密及 Git 安全               | 通過（以最終掃描為準） | .env 忽略、不追蹤；不印憑證，無 reset、清庫、commit 或 push                |
| Docker Compose                | 設定解析通過           | 保留原生 PostgreSQL；引擎狀態依當輪 runtime 記錄，不重設 Docker            |
| Linux 容器／正式 TLS／遠端 CI | 未測試                 | 不以 Windows／本機測試宣稱部署成功                                         |
| 正式簡報／功能架構附件        | 未取得                 | 沒有假稱已閱讀；需求決策已記錄                                             |

### 測試與操作

一般後端 64、前端 31、真實 PostgreSQL 整合 36，共 **131 項**，原 56＋新增 75。原前端登入導覽斷言依新功能由六個待開發改四個，增加菜單路由驗證；其餘既有測試保留。重跑不累加總數。

實際執行 npm run check（含 typecheck、test、build）、npm run db、npm run test、npm run test:integration。最終 exit code 與逐項命令輸出見 verification/phase2b；ZIP 實體另重新開啟查 CRC、manifest／SHA-256、禁止路徑及機密格式，不只檢查打包目錄。

瀏覽器用隔離 PostgreSQL、臨時 localhost:5174／API 3002 及隨機四角色帳密，完成食材／分類／餐點新增、配方保存重讀、修改移除、unit 拒絕、分類停用及餐點停用保留關聯。補充確認 KITCHEN 可讀庫存、低庫存篩選及 2 份需求 200.250、庫存 0.000／不足 200.250，無寫入控制；CASHIER 無庫存／配方權。帳密及本次資料已清理，所有範例為真實測試 DB 資料，沒有前端 Mock 冒充。

新食材一律零庫存；僅整合測試的隔離 fixture 會構造非零數量來驗算足夠／不足及非零單位鎖定，並只清理本次 IDs。這不是產品期初庫存功能，未修改既有開發庫存。開發／測試業務表筆數與基準比較見 runtime.json。

本機啟動：依 README npm ci、setup:env、啟動 PostgreSQL、db:generate、db:deploy、db；若尚無管理員則 admin:bootstrap 自訂隱藏密碼，再 npm run dev。服務已開時勿重複啟動。登入後 /ingredients、/menu-categories、/menu-items；配方與「檢查食材」在餐點列。

本次停在 B，套餐／複雜客製化待擴充。下一階段只提出 Order／OrderItem／配方價格快照／StockMovement／IdempotencyRecord 與 API 設計，沒有開始實作，見 NEXT_ORDER_INVENTORY。Docker／Linux、HTTPS、驗證資料清理與稽核仍為部署前事項。

---

## 歷史：第二階段 A — 使用者登入與角色權限

日期：2026-11-10（Asia/Taipei）｜版本 0.2.0。依既有程式與 docs 檢查並開發，未找到正式簡報／功能架構圖；此部分列待確認，不假稱已閱讀。

結論：本機第二階段 A 已完成。**56 項不同測試通過，原有 19 項均保留；未開發其他 ERP 模組，沒有 reset、清空 DB 或 push。** Docker／Linux 與正式 HTTPS 部署不能列為已驗證。

### 逐項結果

| 驗收項目                                | 結果                   | 實際證據                                                                  |
| --------------------------------------- | ---------------------- | ------------------------------------------------------------------------- |
| 沿用 React／Express／Prisma／PostgreSQL | 通過                   | 原架構擴充 auth／users，新增 argon2 依賴，沒有重建專案                    |
| 真實登入、登出、Session 輪替            | 通過                   | HTTP＋DB 測試，實際瀏覽器隨機帳密登入／登出                               |
| Argon2id 安全雜湊                       | 通過                   | 19 MiB／t=2／p=1，正誤密碼驗證與 DB 雜湊格式                              |
| HttpOnly Cookie、CSRF、登入限流         | 通過                   | Cookie、Origin／token 拒絕、DB rate limit 與 Retry-After；登入也驗 CSRF   |
| 正式 Secure／__Host- Cookie 設定        | 通過（設定與自動測試） | HTTPS 模式屬性測試及不安全設定拒絕；正式 TLS 傳輸另未測試                 |
| 四角色與後端 RBAC                       | 通過                   | 未登入 401，其他三角色管理 API 403；ADMIN 寫入交易再次驗權                |
| 前端登入狀態／受保護路由／權限導覽      | 通過                   | 前端 15 項測試；瀏覽器登出後直開管理頁返回登入                            |
| 帳號新增、修改、停用、啟用              | 通過                   | PostgreSQL 整合 CRUD／去重；真實瀏覽器編輯自己姓名                        |
| 停用後撤銷全部既有 Session              | 通過                   | 同帳號兩個 Session 皆失效；停用不可登入；角色／密碼變更亦撤銷             |
| 登入／停用競爭、自停用／降權保護        | 通過                   | DB 交易再驗版本，錯誤回應 401／409，無錯誤新 Session                      |
| 安全開發管理員工具                      | 通過                   | 隨機程序環境實測首位建立、重複／production 拒絕、不印密碼，已清除本次帳號 |
| Additive Migration 與既有資料           | 通過                   | 開發／測試已套用兩版，初始 SQL 未變，五張業務表筆數與初始一致             |
| 原 19 測試完整保留                      | 通過                   | 四個原測試檔內容與驗收快照相同，原單元／整合皆通過                        |
| 首頁／管理頁／繁中／響應式              | 通過                   | 真實瀏覽器，首頁 DB up、ADMIN 七模組六待開發；1280／390 無 body 溢位      |
| .env 與憑證安全                         | 通過                   | 忽略且未追蹤，現有 DB 憑證在可提交檔／前端 build 比對 0 筆                |
| Docker Compose 設定                     | 通過（解析）           | --profile app --profile test config --quiet exit 0                        |
| Docker 引擎／Linux 完整執行             | 未驗證成功             | 沿用第一階段引擎逾時限制；本次不 reset、不刪 volume                       |
| 正式 HTTPS、遠端 CI                     | 未測試                 | 未遠端部署、未 push，Secure 設定測試不等同 TLS 上線驗收                   |
| 正式簡報／功能圖核對                    | 未測試                 | 未在工作目錄找到附件；政策見 PHASE2A-DECISIONS                            |

### 命令與測試數

| 命令                     | 結果                                                        |
| ------------------------ | ----------------------------------------------------------- |
| npm run db:deploy        | exit 0，新增 auth migration，未修改初始 migration           |
| npm run db               | exit 0，Schema diff 無差異，兩版 checksum 與原四 CHECK 一致 |
| npm run typecheck        | exit 0（最終 check 內亦執行）                               |
| npm test                 | exit 0，後端 27＋前端 15＝42                                |
| npm run test:integration | exit 0，真實 DB 14（原 3＋新增 11）                         |
| npm run build            | exit 0（最終 check 內亦執行），後端與 Vite production build |
| npm run check            | exit 0，Schema validate＋typecheck＋test＋build             |
| npm run admin:bootstrap  | 隔離 DB 首次 exit 0；重複／production 故意 exit 1，保護正確 |

一般測試原 16＋新增 26＝42；整合原 3＋新增 11＝14；總計 56，不重複累計 check 內重跑。原 test 檔與初始 migration 經快照逐檔比對；完整命令輸出及摘要在 verification/phase2a，舊 verification 頂層內容是第一階段歷史。

開發途中曾有 TypeScript／Fetch 解析錯誤、Prisma void 解析失敗、沙箱阻擋 loopback 的 EACCES，以及自己姓名更新後提示消失；已分別修正程式、正確以允許 loopback 的執行環境重跑、加入回歸測試。失敗嘗試不列為通過；最終結果由 RESULTS.json 與原始輸出核對。

### 操作與後續界線

現有原生 DB 以 node scripts/local-postgres.mjs start 啟動；新環境依 README 安裝、setup:env、啟動 DB、db:generate、db:deploy。執行 npm run admin:bootstrap，隱藏輸入自訂 Email／密碼；已有管理員則用既有帳號管理，不覆寫。執行 npm run dev，開 http://127.0.0.1:5173/login。可分開 dev:api／dev:web。

本次瀏覽器使用專用測試 DB、臨時 API 3002／前端 localhost:5174，測完移除本次帳號、其 Session 及暫存密碼，並停止臨時程序；Cookie 與主開發使用不同 hostname，避免不同 port 共用 Cookie。開發 DB 的 users／ingredients／menu_items／menu_categories／recipe_ingredients 均維持 0。開發 API／前端／PostgreSQL 備援保留運行，沒有預設帳密。

使用者管理暫僅 ADMIN；其他模組權限與正式附件待核對。後續可在團隊驗收後進入食材／菜單配方階段；本次到此停止。正式上線前仍需 Docker／Linux、HTTPS、過期 Session／限流資料維護與登入事件稽核。

---

## 第一階段歷史驗收

以下保留舊版證據，描述不代表第二階段現況。

日期：2026-11-10（Asia/Taipei）｜版本：0.1.0｜範圍：基礎建置驗收與必要修復。

最新一輪為下方「八、最後驗收與 ChatGPT 審查封裝」。前面保留歷史驗收結果；本次內嵌瀏覽器重新驗收受環境限制，不視為重新通過。

結論：**本機全端基礎驗收通過，19 項測試通過；Docker／Linux 容器執行與遠端 CI 尚未測試成功，不列入通過。** 未開發新的 ERP 業務模組。

## 一、必要檔案與實際程式碼

| 路徑                | 結果           | 實際檢查內容                                                                                 |
| ------------------- | -------------- | -------------------------------------------------------------------------------------------- |
| apps/frontend       | 通過           | React Router、Layout、七模組設定、Fetch client、健康檢查 hook、狀態頁與測試                  |
| apps/backend        | 通過           | Express app/server、Routes／Controller／Service／Repository、錯誤 middleware、OpenAPI 與測試 |
| apps/backend/prisma | 通過           | PostgreSQL Schema、Role、五張基礎資料表、SQL migration、lock                                 |
| scripts             | 通過           | 環境檔初始化、PostgreSQL 備援與隔離整合測試啟動器                                            |
| docs                | 通過           | ARCHITECTURE、API、PROGRESS，另補安全與本驗收報告                                            |
| docker-compose.yml  | 通過           | DB／test／app profiles、依賴與 healthcheck，config --quiet 可解析                            |
| package.json        | 通過（已修復） | workspaces、engines、開發／建置／測試命令，新增原本缺少的 db 命令                            |
| package-lock.json   | 通過           | npm ci 成功；未變動依賴或 lockfile                                                           |
| README.md           | 通過（已更新） | Docker 與原生備援完整指令、驗收命令、限制與服務狀態                                          |
| .gitignore          | 通過           | 環境檔、依賴、產生程式碼與 runtime 資料不進版控                                              |
| .env.example        | 通過           | 欄位完整，密碼為佔位符，沒有實際憑證                                                         |

上述結果是閱讀實際檔案、執行命令與瀏覽器操作後得到，沒有只依據 README。

## 二、執行環境

| 項目                                 | 結果   | 證據                                                                              |
| ------------------------------------ | ------ | --------------------------------------------------------------------------------- |
| Node.js 版本                         | 通過   | 24.11.0，符合 >=24.11.0 <25                                                       |
| npm 版本                             | 通過   | 11.6.1，符合 >=11 <12                                                             |
| npm ci                               | 通過   | 完成安裝，npm audit 回報 0 vulnerabilities                                        |
| PostgreSQL 啟動與連線                | 通過   | 原生 PostgreSQL 17.11，開發／測試資料庫各自獨立                                   |
| Prisma Schema／實際資料庫            | 通過   | migrate diff 回報 No difference detected                                          |
| Prisma Schema／Migration             | 通過   | 已套用 1 版、SQL checksum 相符、4 項 CHECK 定義與 validated 狀態相符              |
| React 啟動                           | 通過   | Vite 5173，首頁 HTTP 200，瀏覽器實測                                              |
| Express 啟動                         | 通過   | 開發 3000；編譯後 API 另於 3001 實測 HTTP 200                                     |
| 前端真實呼叫後端                     | 通過   | /api/health 經 Vite Proxy 回 200，重新檢查產生不同 request ID                     |
| health 正常／資料庫不可用            | 通過   | 正常 200 / database up；獨立 API 連向不可用 DB 時 503 DATABASE_UNAVAILABLE        |
| Compose 設定解析                     | 通過   | app、test 全 profiles config --quiet exit 0                                       |
| Docker 引擎可用性                    | 失敗   | 限時 version／status 查詢逾時；Desktop start 僅回覆已在執行，無法取得健康引擎回應 |
| Docker image build／Compose 完整啟動 | 未測試 | 引擎無法驗證，不宣稱容器可正常執行                                                |
| Linux 容器端到端                     | 未測試 | 等 Docker 引擎可用後驗證                                                          |
| GitHub Actions 遠端執行              | 未測試 | 沒有 remote、commit 或 push；CI 僅完成設定／語法檢查                              |

資料庫失敗情境使用獨立的臨時 API 程序，不停止正在使用的 PostgreSQL、不修改 `.env` 或角色密碼。臨時離線驗證程序已停止。

## 三、實際執行命令

| 命令                                                       | 結果         | 範圍                                                                 |
| ---------------------------------------------------------- | ------------ | -------------------------------------------------------------------- |
| npm run db（原始版本）                                     | 失敗，已修復 | Missing script: db                                                   |
| npm ci                                                     | 通過         | lockfile 安裝                                                        |
| npm run db（修復後）                                       | 通過         | validate、generate、status、唯讀 schema diff、checksum 與 CHECK 約束 |
| npm run typecheck                                          | 通過         | 前後端及新增驗收工具                                                 |
| npm test                                                   | 通過         | 後端 11／11，前端 5／5                                               |
| npm run build                                              | 通過         | 前後端 production build，無 chunk 大小警告                           |
| npm run check                                              | 通過         | Schema 驗證、型別、一般測試與建置                                    |
| npm run test（資料庫可用後）                               | 通過         | 同一組一般測試再次驗證，不視為新增案例                               |
| npm run test:integration                                   | 通過         | 真實 PostgreSQL 3／3；修正約束判斷後已重跑通過                       |
| npm run test -w @erp/backend                               | 通過         | 安全錯誤內容測試調整後，後端 11／11                                  |
| npx prettier --check .                                     | 通過         | TypeScript、JSON、YAML、文件格式                                     |
| docker compose --profile app --profile test config --quiet | 通過         | 本機設定解析，不需引擎                                               |

獨立測試案例總數為 **19**，不把 `check` 等命令重複執行的相同案例再加總。一般測試注入 repository／fetch；只有 integration 與真實 HTTP 驗收計為 PostgreSQL 連線驗證。

## 四、瀏覽器逐項驗收

| 要求                | 結果 | 實際操作                                           |
| ------------------- | ---- | -------------------------------------------------- |
| ERP 管理系統首頁    | 通過 | 系統總覽、Header、狀態卡與連線區                   |
| 左側七大模組        | 通過 | 逐一點開七個路由，名稱與頁面標題相符               |
| 繁體中文            | 通過 | html lang=zh-Hant、主介面與錯誤訊息為繁體中文      |
| 前後端連線成功      | 通過 | 顯示服務已回應，重新檢查有新 request ID            |
| PostgreSQL 連線正常 | 通過 | 顯示資料庫正常與當次真實查詢耗時                   |
| 未完成標示          | 通過 | 七頁均有尚未開發狀態，無可誤認為已完成的 CRUD      |
| 桌面／手機          | 通過 | 1440×1000、390×844；手機無橫向溢位，導覽後自動收起 |

截圖與 JSON 證據位於 `outputs/acceptance/`。手機測試遇到一次自動化點擊未送達，使用同一瀏覽器的實際點擊重新驗證通過；未把該次工具操作失敗當成產品通過證據。

## 五、必要修復

1. 補齊缺少的 `npm run db`，採唯讀完整性檢查，不套用 migration 或 reset。
2. 加入 migration checksum 與手寫 CHECK 約束檢查，避免只看 Schema validate 就誤判同步；新增 3 項驗收防護測試，涵蓋 migration 竄改／缺少／失敗及約束移除／改弱／未驗證。
3. 資料庫約束測試必須符合指定約束錯誤，且意外接受資料時也強制 rollback，避免誤判或殘留無效測試資料。
4. PostgreSQL 暫存密碼檔只清除本次成功建立的檔案，保留原本存在的同名檔。
5. CI 移除硬編碼的固定測試密碼，改為執行時隨機產生並遮蔽。單元測試以敏感字串 sentinel 檢查洩漏，不放假密碼 URL。

沒有修改 Prisma Schema 或已套用 migration SQL，沒有新增業務 API 或前端業務功能。

## 六、安全與未解決事項

安全檢查結果與未執行的安全輪替方法詳見 [SECURITY.md](SECURITY.md)。目前憑證未出現在可提交檔案，`.env` 未被追蹤，沒有輸出密碼或完整連線字串。所有資料與角色密碼保留，沒有 reset、刪 volume、清空資料庫或 push。

尚未解決：Docker 引擎無回應，因此完整容器、Linux 部署與遠端 CI 不能列為通過。正式簡報／ERD 尚未提供；登入、RBAC 與七大業務功能仍未實作，屬下一階段範圍。

## 七、啟動與下一階段判斷

本次保留前端 5173、API 3000，以及 PostgreSQL 55432／55433 供驗收；目前可直接開啟 `http://127.0.0.1:5173/`。不要在服務運行時重複啟動。

若服務已停止，在根目錄執行：

```sh
node scripts/local-postgres.mjs start
npm run db
npm run dev
```

完整乾淨安裝及 Docker 路徑見 README。分開啟動前後端可使用 `npm run dev:api` 與另一個終端的 `npm run dev:web`。停止開發伺服器使用原終端 Ctrl+C；停止 PostgreSQL 使用 `node scripts/local-postgres.mjs stop`，資料保留。

**可以在既有 PostgreSQL 備援上開始下一階段本機開發；尚不能當作可正式部署的 ERP。** 下一階段開始前仍應確認正式 ERD、角色權限、扣庫與取消政策。Docker／Linux 驗收需補齊；本次未開始下一階段。

## 八、最後驗收與 ChatGPT 審查封裝（2026-11-10 晚間，Asia/Taipei）

本輪重新閱讀實際前後端、Schema、Migration、API 與測試檔案，沒有新增 ERP 業務功能。實測紀錄與經遮蔽的命令輸出收錄於 `docs/verification/`，機器可讀摘要為 `FINAL_RESULTS.json`。

| 本次命令／項目                    | 結果               | 實際範圍                                                     |
| --------------------------------- | ------------------ | ------------------------------------------------------------ |
| npm run check                     | 通過，exit 0       | Schema validate、前後端型別、後端 11＋前端 5、兩端 build     |
| npm run db                        | 通過，exit 0       | Schema diff 無差異、1 版 migration checksum、4 項 CHECK 約束 |
| npm run test                      | 通過，exit 0       | 後端 11／11、前端 5／5                                       |
| npm run test:integration          | 通過，exit 0       | 真實 PostgreSQL 3／3，寫入交易 rollback                      |
| React 首頁 HTTP                   | 通過               | 5173 回 200                                                  |
| 前端 Proxy → Express → PostgreSQL | 通過               | /api/health 回 200、database up                              |
| Express health／OpenAPI           | 通過               | 3000 直接呼叫均回 200                                        |
| PostgreSQL 備援                   | 通過               | 17.11，開發／測試 DB 均正常，五張業務表仍各為 0 筆           |
| Compose config                    | 通過               | app／test profiles 可解析                                    |
| Docker 引擎                       | 失敗               | 限時 info 查詢逾時；未重設、未刪 volume，維持原備援          |
| Docker／Linux 容器執行            | 未測試             | 引擎不可用，無法列為通過                                     |
| 本次內嵌瀏覽器畫面重測            | 未完成（環境阻擋） | ERR_NETWORK_IO_SUSPENDED；未繞過瀏覽器政策或修改安全設定     |
| 前次畫面／手機驗收                | 歷史通過           | 不把歷史結果當成本次重測結果                                 |

本輪獨立案例仍為 19 項；重複執行同一組測試不重複加總。沒有執行破壞性 migration、reset、清空資料庫、密碼輪替或 GitHub push。

`.env` 仍被 Git 忽略且未被追蹤；安全輪替方法見 [SECURITY.md](SECURITY.md)，本次不修改現有憑證。輪替應先以新 role／獨立連線驗證權限，再協調切換應用設定，最後停用舊 role，不能只改環境檔就重啟既有資料庫。

審查 ZIP：`outputs/review/team12-restaurant-erp-phase1-review.zip`。包含完整手寫前後端原始碼、測試、Prisma Schema／Migrations、scripts、docs、package／lockfile、Compose、Dockerfiles 與安全設定。`.env.example` 僅含佔位符，可以包含；Prisma 產生的 client 由 generate 重建，不視為手寫原始碼。

封裝採明確範圍與排除規則，排除 `.env` 變體、依賴、Git、work、資料庫實體檔、金鑰憑證及編譯輸出。建立後重新開啟 ZIP，檢查 CRC、每檔 SHA-256、內容完整性、禁止路徑、目前憑證比對與常見金鑰／Token 格式。結果存放於 ZIP 旁的 `ZIP_VERIFICATION.json`；只有 passed=true 的封裝可交付。

ChatGPT 審查順序見 [REVIEW_GUIDE.md](REVIEW_GUIDE.md)，ZIP 根目錄另附 `MANIFEST.json` 列出檔案與 SHA-256。

判斷：程式、型別、建置、API 與資料庫符合第二階段本機開發的技術前提；Docker／Linux 部署尚未通過，本次畫面重驗需待瀏覽器環境恢復或由團隊在一般瀏覽器確認。若課程要求第一階段所有環境項目全數通過，則目前仍屬附帶未結事項的驗收，不能宣稱全面完成。本次不開始第二階段。
