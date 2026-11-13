# 第二階段 A 決策與待確認事項

日期：2026-11-10（Asia/Taipei）。沿用既有專案、資料與核心技術，僅新增使用者登入及權限管理。

## 本次採用

- 登入識別沿用 User.email，正規化小寫，新增 functional unique index 防止大小寫重複。沒有增加另一套帳號或公開註冊。
- 使用者管理採最小授權：**僅 ADMIN**。已詢問團隊是否給店長管理權，未收到補充時依此交付；MANAGER 不可管理帳號。由後端 middleware 與交易內再次驗權。
- ADMIN 不可停用或降權自己，至少保留一位啟用 ADMIN。管理寫入透過同一資料庫 advisory transaction lock 串行，防止併發移除最後管理員。
- 密碼 12–128 字元，Argon2id（19 MiB、2 iterations、parallelism 1、32-byte hash），隨機 salt。錯誤、未知及停用帳號回相同 401，未知帳號也做 dummy hash 驗證。
- PostgreSQL Session，raw token 為 256-bit 隨機、資料庫只存 SHA-256 hash。登入輪替 Session 與 CSRF；閒置 30 分鐘、絕對期限 8 小時。
- 停用、啟用、角色、Email 或密碼改變時撤銷全部 Session；姓名修改保留 Session。每次請求查 User 與 authVersion，寫入交易再驗操作者；登入交易處理驗證後被停用的競爭。
- 同步 CSRF token + 明確 Origin + JSON；登入亦需匿名 Session CSRF。SameSite 與 CORS 均非唯一防護。
- 登入每 IP 30／帳號 10 次，每 15 分鐘；PostgreSQL 持久化計數及 Retry-After。成功也計數，過窗後恢復，不永久鎖帳號。
- 僅首位開發管理員可由 npm run admin:bootstrap 建立；密碼隱藏輸入或程序環境注入。已有啟用 ADMIN 即拒絕，不覆寫帳號。

## 待正式文件確認

已檢查專案與 docs，**未找到正式簡報或功能架構圖附件**，不能宣稱已閱讀。後續需由團隊提供，以核對角色、命名與流程。本次依使用者訊息及既有 User Schema 實作。

店長帳號管理權、其他六模組詳細角色矩陣、密碼政策與 Session 時限可再確認。待開發模組側欄的可見範圍只是導覽設定，不表示其業務 API 已授權或實作。

不加入多店、多租戶、註冊、忘記密碼、寄信、MFA、訂單、採購、排班等新範圍。

## 維運界線

- HTTP 非 Secure Cookie 僅允許 loopback 開發。正式主機需 APP_ORIGIN=https 完整 origin、SESSION_COOKIE_SECURE=true，使用 __Host- Cookie。production 僅信任 APP_ORIGIN。
- 直連 API 用 TRUST_PROXY_HOPS=0；本機 Compose 單層 Nginx 用 1，Nginx 覆寫 X-Forwarded-For。正式環境須封鎖代理以外的 API 存取，否則 IP 限流不可視為可靠邊界。
- 過期 Session／rate-limit 列不再有效，目前沒有排程清理。正式營運前安排只清理過期驗證資料的維運程序、容量監控及登入稽核，不動 User／營運資料。
- Docker 引擎、Linux image 與遠端 CI 不因本機測試而成為已驗證，依 ACCEPTANCE 實際紀錄。

## 安全依據

[OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)、[Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)、[CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) 及 [node-argon2 官方專案](https://github.com/ranisalt/node-argon2)。
