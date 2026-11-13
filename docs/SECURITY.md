# v0.4.0 安全增補（2026-11-12）

## 最終安全驗收補充（2026-11-12）

比對.env與.env.example，現有.env缺少APP_ORIGIN、SESSION_COOKIE_SECURE、SESSION_IDLE_MINUTES、SESSION_MAX_HOURS、TRUST_PROXY_HOPS及兩個LOGIN_RATE_LIMIT欄位；既有Zod設定會給合法預設，實際值為127.0.0.1:5173、false、30分鐘、8小時、0與IP30／帳號10次／15分鐘，沒有停用保護。HttpOnly＋SameSite=Lax，本機HTTP才非Secure，CSRF仍驗同步token與完整Origin。本輪保留.env，不修改現有資料庫密碼。

本次已比對原開發帳號／業務資料指紋、四版Migration雜湊、Git忽略及機密內容；專用驗收庫55434與原開發／一般測試分開，只重啟專用庫。work/acceptance-demo/private.json含本機隨機展示憑證，須保持本機、不共享；整個work排除ZIP。即使掃描0筆，也不能證明先前分享過的憑證未外洩；若曾分享真實憑證，建議依下方新role→獨立驗證→協調切換→停用舊role方案輪替。涉及既有連線切換前需使用者確認，本輪未執行。

沿用Session、CSRF、Argon2id與限流。新業務寫入每次後端RBAC並在交易內重新核對active、authVersion與role。CASHIER回應移除食材配方；KITCHEN禁止採購、使用者、人事及庫存寫入。所有數量經Decimal與DB約束，不接受前端總額。新命令持久化去重、原子快照與庫存流水。

.env未改、未輪替現有密碼、未push。測試帳號密碼每次隨機產生，只存在被忽略的work且驗收後移除。審查ZIP排除環境檔與資料庫實體檔，建立後重開掃描。既有安全輪替方法如下；先驗證新連線再協調切換，不能僅改.env而中斷現有服務。

# 安全設定與憑證輪替

日期：2026-11-10（Asia/Taipei）。現行為第二階段 B，下列 DB 輪替提案沿用前階段；本次不改既有 DB 密碼、不重設資料庫。

## 實際檢查結果

| 項目                         | 結果             | 證據與界線                                                          |
| ---------------------------- | ---------------- | ------------------------------------------------------------------- |
| `.env` 被 Git 忽略           | 通過             | `git check-ignore .env`，且不在 `git ls-files`                      |
| 本機環境檔變體               | 通過             | 根目錄、frontend、backend 的 `.env.*` 均忽略；只允許 `.env.example` |
| 目前 DB 憑證出現在可提交檔案 | 通過             | 於記憶體讀取後比對，不輸出值；掃描結果 0 筆                         |
| Git 索引／歷史               | 通過             | 機密檔 0、暫存檔 0、commit 0、無 remote；未 push                    |
| 前端公開環境變數             | 通過             | 沒有把資料庫 URL、密碼、token 放入 VITE 變數                        |
| Docker build context         | 通過             | `.dockerignore` 排除 `.env` 變體、work、outputs、Git 與依賴         |
| Docker runtime 憑證          | 通過（設定檢查） | 從環境變數注入，Dockerfile 無實際憑證；完整容器執行未驗證           |
| 本機 listen 位址             | 通過             | 前端與 API 綁 127.0.0.1；Compose host ports 也只綁本機              |
| API 錯誤洩漏                 | 通過             | 單元測試與真實 503 均不回傳內部敏感內容                             |
| 開發密碼硬編碼               | 通過             | 程式從環境讀取，範例為佔位符；CI 固定測試密碼已移除                 |

CI 現在於 job 執行時產生一次性隨機密碼，先註冊日誌遮蔽，再傳入隔離測試容器及該 job 的環境。這項配置已做 YAML／shell 語法檢查，尚未在 GitHub 遠端執行。遮蔽方式依據 [GitHub Actions 官方說明](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands)。

未發現目前本機資料庫密碼出現在可提交原始碼或 Git 索引／歷史。這項結論不涵蓋使用者可能在其他聊天、外部儲存庫或第三方系統分享過的內容；若已知曾外洩，應安排下列輪替。本次沒有改寫 `.env` 或資料庫角色密碼。

## 不影響既有連線的輪替方案（僅提案，未執行）

1. 先確認受影響的是開發 DB、測試 DB 或兩者，列出所有使用者與服務，確認可用的管理連線及備份。
2. 建立新的 login role，配置經審核的必要權限，分別核對 schema／table／sequence、Migration 讀寫及物件擁有權；不要為方便而直接授予 SUPERUSER。保留舊 role。
3. 用 `psql` 的互動式 `\password` 設定新 role 密碼，或以既有密鑰管理工具處理。不要把密碼放進 shell 參數、SQL 檔或 Git。PostgreSQL 官方建議用互動命令避免明文出現在命令歷史或伺服器日誌，見 [ALTER ROLE 文件](https://www.postgresql.org/docs/17/sql-alterrole.html)。
4. 使用未追蹤的 `.env.next` 驗證新憑證，先以獨立連線測 SELECT 1、資料表存取及交易內的 CRUD／rollback。不要先覆寫正在使用的 `.env`。
5. 新連線驗證通過後，安排應用程式切換新憑證並重新載入；確認 health、migration 檢查與必要操作。若要求應用零停機，需另有兩個 app instance／滾動切換流程，目前單一開發程序不承諾零停機。
6. 所有使用者都切換、觀察通過後，再停用舊 role 的新登入。物件擁有權與舊連線清理須另行確認，不能直接刪 role 或資料庫。
7. 開發與測試資料庫分別處理，更新對應環境變數。完成後重跑 `npm run db`、`npm test`、`npm run test:integration`，保留不含密碼的結果。

若選擇直接變更現有 role 密碼，必須先協調維護時段、保留管理連線，連同應用設定一起切換；不得只改 `.env` 後假設資料庫會跟著變更。

## 既有資料與 Docker 的注意事項

PostgreSQL 官方 Docker image 的初始化環境變數，只會在空資料目錄初始化時生效。改 `POSTGRES_PASSWORD` 後重啟，**不會替既有 volume 內的角色改密碼**；只改環境設定可能使應用與資料庫憑證不一致。依據 [官方 image 說明](https://github.com/docker-library/docs/blob/master/postgres/README.md)。

原生備援也會保留既有 cluster 的角色設定，不會因更改 `.env` 就自動輪替。不要為了套用密碼執行 reset、刪 volume、刪 data directory 或重新 initdb。

本機初始化工具產生十六進位隨機密碼，適用目前 Compose URL 組裝方式。若自行使用含 URL 特殊字元的密碼，需另外確認連線字串編碼與 Compose 注入方式，不能直接套用未編碼的字串。

## 第二階段 A 驗證與授權

第二階段 B 仍沿用以下驗證機制。ADMIN／MANAGER 可管理目錄，KITCHEN 依團隊明確授權 GET 食材庫存／安全庫存／提醒及足夠性；所有非讀取操作由後端管理角色 guard，交易寫入再驗權。食材 DTO 白名單排除採購／供應商敏感資料。CASHIER 只讀菜單。足夠性是 READ ONLY 交易，不扣庫、不保留或建立訂單。原使用者管理僅 ADMIN，採購 API 尚未開放。

已實作 Argon2id、DB Session、登入時輪替、HttpOnly／SameSite Cookie、同步 CSRF token／Origin／JSON、PostgreSQL 登入限流與 RBAC。未知、錯誤與停用帳號回相同 401；不回傳雜湊、版本或 raw Session token。原始碼沒有固定帳密。

停用或修改敏感欄位時，在同一交易撤銷全部 Session；每次 API 重新驗有效 User 與版本，寫入交易再驗 ADMIN。ADMIN 不可停用／降權自己。首位開發帳號以 admin:bootstrap 隱藏輸入密碼，後續由 ADMIN 建立，不公開註冊。

本機 HTTP 僅限 loopback；正式域名必須 HTTPS + Secure Cookie，採 __Host- 前綴且不設定 Domain。production 只接受 APP_ORIGIN。直連 trust proxy=0；單層 Nginx=1 並覆寫 forwarded IP；正式部署務必限制 API 只接受該代理，避免偽造 IP 繞過限流。

目前無排程清理過期驗證資料、登入事件稽核或正式 HTTPS 部署；上線前須完成監控、容量與備份規劃。訂單、庫存異動、採購、排班與報表尚未開發。完整政策、依據與待確認事項見 PHASE2A-DECISIONS，不能據本機通過宣稱完整 ERP 已上線。
