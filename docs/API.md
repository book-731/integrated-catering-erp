# v0.4.0 API 更新

## 最終驗收補充

GET /api/operations/menu/:id/configuration不存在資源現在回404 NOT_FOUND；VALIDATION_ERROR訊息含失敗欄位路徑，不包含輸入值。寫入仍維持Session、Origin、CSRF與RBAC。完整權限矩陣見OPERATIONS-DECISIONS，實際路由及Request schema見OpenAPI。

最新業務契約與完整欄位見 [OPERATIONS-API.md](OPERATIONS-API.md)。保留既有登入、使用者及catalog端點；新增 /api/operations。以下 v0.3.0 段落是既有契約與歷史範圍，若有「尚未開發」描述，以最新業務文件為準。

# REST API v0.3.0 — 第二階段 B

本機 API：`http://127.0.0.1:3000/api`。React 使用同源 `/api`，由 Vite／Nginx Proxy 轉送。實際規格見 `apps/backend/src/openapi.ts` 與 `modules/auth/auth.openapi.ts`；`/api/openapi.json`、`/api/docs/` 共用同份規格。

## 食材、分類、餐點與配方

規格新增於 modules/catalog/catalog.openapi.ts，與原登入 API 共用 Session、CSRF、JSON envelope 及錯誤 middleware。任何寫入須 HttpOnly Cookie、允許的 Origin、X-CSRF-Token 與 application/json；交易內會再次核對操作者。

| 方法   | 路徑                                           | 權限                    | 用途                                               |
| ------ | ---------------------------------------------- | ----------------------- | -------------------------------------------------- |
| GET    | /api/ingredients、/api/ingredients/:id         | ADMIN／MANAGER／KITCHEN | 食材清單／單筆，含唯讀現有／安全庫存及提醒         |
| POST   | /api/ingredients                               | ADMIN／MANAGER          | 新增，庫存固定 0，成功 201                         |
| PATCH  | /api/ingredients/:id                           | ADMIN／MANAGER          | 修改基礎資料／停用／啟用，不接受庫存寫入           |
| GET    | /api/menu-categories、/api/menu-categories/:id | 四種登入角色            | 分類清單／單筆，含所屬餐點數                       |
| POST   | /api/menu-categories                           | ADMIN／MANAGER          | 新增分類，成功 201                                 |
| PATCH  | /api/menu-categories/:id                       | ADMIN／MANAGER          | 改名／停用／啟用，保留餐點                         |
| GET    | /api/menu-items、/api/menu-items/:id           | 四種登入角色            | 餐點清單／單筆，含分類與配方項數                   |
| POST   | /api/menu-items                                | ADMIN／MANAGER          | 新增一般餐點，成功 201                             |
| PATCH  | /api/menu-items/:id                            | ADMIN／MANAGER          | 修改／停用／啟用與供應設定                         |
| GET    | /api/menu-items/:id/recipe                     | ADMIN／MANAGER／KITCHEN | 完整配方、停用狀態與版本；不回傳食材庫存或安全庫存 |
| PUT    | /api/menu-items/:id/recipe                     | ADMIN／MANAGER          | 原子替換完整配方，新增／改用量／移除列             |
| GET    | /api/menu-items/:id/ingredient-availability    | ADMIN／MANAGER／KITCHEN | 唯讀查詢指定份數是否足夠，不保留或扣庫             |
| POST   | /api/menu-items/:id/image                      | ADMIN／MANAGER          | 上傳餐點照片二進位檔案（JPG/PNG/WebP，<=2MB）      |
| DELETE | /api/menu-items/:id/image                      | ADMIN／MANAGER          | 刪除餐點照片，將 imageUrl 設為 null 並清理硬碟檔案 |
| GET    | /api/menu-items/images/:filename               | 四種登入角色            | 讀取餐點照片二進位檔案，具 inline 與 private 快取  |

本階段食材、分類與餐點無實體資料刪除端點（以 PATCH isActive=false 停用）；唯餐點照片支援 DELETE /api/menu-items/:id/image 清理實體檔案。沒有訂單或庫存調整／扣除 API。

### 清單 query 與回應

三種資源共用 q（最多 100 字元，不分大小寫）、isActive=true|false、page（1–100000，預設 1）、pageSize（1–100，預設 20）。食材 q 搜尋 SKU／名稱，另可 unit 精確篩選及 lowStock=true|false（<= 安全庫存／高於安全庫存）；分類 q 搜尋名稱；餐點另可 categoryId UUID、isAvailable=true|false。拒絕額外 query 欄位。排序 name ASC、id ASC。

data 為 `{ items, total, page, pageSize }`。單筆／新增／修改分別包 `{ ingredient }`、`{ category }`、`{ menuItem }`。資源不存在回 404 RESOURCE_NOT_FOUND。

### 食材格式

新增必填 sku（1–64 位英數、點、底線、連字號，trim 後轉大寫）、name（trim 後 1–100 字元）、unit（trim 後 1–20 位文字／數字，不能含空白或符號）；safetyStock 預設字串 0、isActive 預設 true。修改至少一欄，未提供保持原值。

```json
{ "sku": "RICE-001", "name": "白米", "unit": "g", "safetyStock": "500.125", "isActive": true }
```

回傳另含 id、stockQuantity（唯讀）、isLowStock、createdAt、updatedAt。數量固定 3 位小數，如 stockQuantity="0.000"。isLowStock 為 Decimal 比較 stockQuantity <= safetyStock。

**stockQuantity 不在新增／修改 schema，提供即 422。** 不允許無紀錄的期初庫存或調整。SKU 忽略大小寫／前後空白唯一，衝突 409 SKU_CONFLICT。有配方或非零庫存時修改 unit 回 409 UNIT_LOCKED。

### 分類與餐點格式

分類新增 `{ name, isActive? }`，名稱 trim 後 1–100，不分大小寫／前後空白唯一，衝突 409 CATEGORY_NAME_CONFLICT。回傳 id、name、isActive、menuItemCount。停用仍保留所屬餐點與 FK。

餐點新增必填 name、categoryId、price；imageUrl 預設 null、isActive／isAvailable 預設 true。

```json
{
  "name": "雞腿飯",
  "categoryId": "22345678-1234-4234-8234-123456789012",
  "price": "99.90",
  "imageUrl": null,
  "isActive": true,
  "isAvailable": true
}
```

price 必須非負十進位字串，最多 10 位整數／2 位小數；imageUrl 為 null、無帳密 HTTP(S) 絕對 URL 或本機圖片路徑（`/api/menu-items/images/<uuid>.<ext>`），最長 2048。本機圖片可透過 `POST /api/menu-items/:id/image` 上傳（支援 image/jpeg、image/png、image/webp，上限 2 MB），後端會檢驗魔術位元組並儲存於本機伺服器；透過 `DELETE /api/menu-items/:id/image` 可移除圖片並自動刪除實體檔案；亦可由四種登入角色透過 `GET /api/menu-items/images/:filename` 串流讀取。若透過 `PATCH /api/menu-items/:id` 將 imageUrl 修改為 external URL 或 null，後端亦會自動清理舊本機圖檔。回應額外含 category 摘要、recipeCount、recipeVersion 與時間。

新建餐點／變更分類／重新啟用餐點須啟用分類，否則 409 CATEGORY_INACTIVE。既有分類停用不刪除餐點，普通欄位修改可保留原分類。isAvailable 是供應設定，未實作下單可售與庫存驗證。

### 配方與單位契約

GET data：`{ recipe: { menuItemId, version, items: [{ ingredientId, sku, name, unit, quantity, isActive }] } }`。quantity 固定 3 位。停用食材仍可查，不帶庫存欄位。以 Repeatable Read 取得一致版本與用量。

PUT 示意（UUID 僅為格式範例）：

```json
{
  "expectedVersion": 0,
  "items": [
    { "ingredientId": "12345678-1234-4234-8234-123456789012", "quantity": "100.125", "unit": "g" }
  ]
}
```

expectedVersion 為 GET 的非負整數版本；items 是完整新集合，最多 100，可為空。重複 ingredientId 回 409 RECIPE_DUPLICATE；unit 必須與食材基礎單位完全相同（含大小寫），錯配 422 UNIT_MISMATCH，不進行 g／kg 換算。quantity 必須大於 0。

停用食材僅能保留原量或移除，新加入／改用量回 409 INGREDIENT_INACTIVE。停用餐點配方只讀，寫入 409 MENU_ITEM_INACTIVE。過期版本回 409 RECIPE_VERSION_CONFLICT，前端保留草稿，需明確重新載入後編輯。成功回新配方與遞增版本；任何 DB 失敗整筆 rollback，不改庫存。

### 食材足夠性唯讀查詢

GET /api/menu-items/:id/ingredient-availability?servings=2。servings 預設 1，僅接受 1–10000 整數字串，小數／科學記號等錯誤 422。ADMIN／MANAGER／KITCHEN 允許，CASHIER 403，未登入 401；沒有 POST 或庫存寫入端點。

data 為 `{ availability: { menuItemId, recipeVersion, servings, canPrepare, blockers, items, checkedAt, reservation: false } }`。items 每列含 ingredientId、sku、name、unit、quantityPerServing、requiredQuantity、stockQuantity、safetyStock、isLowStock、isActive、sufficient、shortageQuantity；所有數量固定 3 位字串。沒有採購價格、供應商或使用者敏感資料。

以 Decimal 乘整數份數、比較庫存及計算不足量，Repeatable Read + READ ONLY 交易取得一致資料，不改庫存或配方版本。空配方、停用／停供餐點、停用分類／食材皆不可判定可製作。這是當下查詢，非保留、訂單或扣庫承諾。

### Decimal 與驗證錯誤

數量上限 99999999999.999、價格上限 9999999999.99。不接受 JSON number、負值、科學記號、前導零、空白及超過小數精度；不做隱式四捨五入。後端 Prisma.Decimal 建構／比較，回應數量固定 3 位、金額固定 2 位。格式錯誤 422 VALIDATION_ERROR；無權 401／403；未知內部錯誤安全 500。

其他新衝突碼：RESOURCE_IN_USE（FK 保護）、RESOURCE_CONFLICT。完整 policy 與權限比較見 PHASE2B-DECISIONS。套餐／複雜客製化、訂單、庫存流水及快照僅為後續規劃。

## 已開放端點

| 方法  | 路徑              | 權限                | 說明                                                     |
| ----- | ----------------- | ------------------- | -------------------------------------------------------- |
| GET   | /api/health       | 公開                | Prisma 執行 PostgreSQL SELECT 1，成功 200／DB 不可用 503 |
| GET   | /api/openapi.json | 公開                | OpenAPI 3.0.3                                            |
| GET   | /api/docs/        | 公開                | Swagger UI                                               |
| GET   | /api/auth/session | 公開                | 目前使用者或匿名 Session、CSRF token、絕對期限           |
| POST  | /api/auth/login   | 有效 Session + CSRF | Email／密碼登入，輪替 Session 與 CSRF token              |
| POST  | /api/auth/logout  | 有效 Session + CSRF | 撤銷目前 Session，清除 Cookie                            |
| GET   | /api/auth/me      | 任一登入角色        | 目前登入者；無登入 401                                   |
| GET   | /api/users        | ADMIN               | 使用者分頁、搜尋與篩選                                   |
| POST  | /api/users        | ADMIN + CSRF        | 新增帳號，成功 201                                       |
| PATCH | /api/users/:id    | ADMIN + CSRF        | 修改、停用、啟用或設定新密碼                             |

沒有公開註冊或刪除帳號 API。MANAGER、CASHIER、KITCHEN 皆無使用者管理 API 權限；本階段菜單／食材權限見上方矩陣。

## 瀏覽器 Session 流程

1. GET /auth/session，使用 credentials: include。未登入回傳 user: null 並設定匿名 Cookie；CSRF token 只存前端記憶體。
2. POST /auth/login，JSON `{ email, password }`，攜帶 Cookie、瀏覽器產生的 Origin 及 X-CSRF-Token。不可省略 Origin；不可跨未允許來源呼叫。
3. 成功後刪除舊 Session、建立新 Session，設定新 HttpOnly Cookie，回傳新 CSRF token。後續寫入使用新 token。
4. GET /auth/me／其他受保護端點查 DB Session 與 User 狀態，不採信前端角色。
5. POST /auth/logout，JSON `{}` 及相同安全標頭，撤銷目前 Session；前端再取得新的匿名 Session。

Cookie 本機為 `erp.sid`；Secure 模式為 `__Host-erp.sid`。皆 HttpOnly、SameSite=Lax、Path=/，不設定 Domain；非 loopback 部署強制 HTTPS + Secure。raw Session token 不回傳 JSON、不存 localStorage，DB 僅存 SHA-256 hash。預設登入絕對期限 8 小時、閒置 30 分鐘；匿名 Session 20 分鐘。expiresAt 是絕對期限。

新增匿名 Session 每 IP 60 次／分鐘。登入預設每 IP 30 次、每帳號 10 次／15 分鐘，成功與失敗都計數，超額回 429 與 Retry-After 秒數。計數保存於 PostgreSQL。正式部署須限制 API 只能由可信反向代理到達，正確設定 TRUST_PROXY_HOPS，參閱架構與安全文件。

## 成功與錯誤契約

應用 JSON：`{ success: true, data, requestId }`。規格 JSON／Swagger HTML 不包 ERP envelope。API 回應 Cache-Control: no-store 與 X-Request-ID。

Session data：`{ user: PublicUser | null, csrfToken: string, expiresAt: ISO8601 }`。

PublicUser 僅含 id、email、displayName、role、isActive、createdAt、updatedAt。不含 password、passwordHash、authVersion 或 Session token。單一使用者端點 data 為 `{ user }`。

錯誤：`{ success: false, error: { code, message }, requestId }`，不含 stack、SQL、完整 URL、密碼或 token。

| HTTP | code                          | 情境                                       |
| ---- | ----------------------------- | ------------------------------------------ |
| 400  | INVALID_JSON                  | JSON 語法錯誤                              |
| 401  | UNAUTHENTICATED               | 未登入、過期或已撤銷 Session               |
| 401  | INVALID_CREDENTIALS           | 密碼錯誤、未知帳號、停用帳號皆使用相同訊息 |
| 403  | FORBIDDEN                     | 已登入但角色不符                           |
| 403  | CSRF_INVALID                  | Session、Origin 或 CSRF token 不符／缺少   |
| 403  | ORIGIN_NOT_ALLOWED            | CORS 來源不允許                            |
| 404  | USER_NOT_FOUND／NOT_FOUND     | 帳號不存在／未知 API                       |
| 409  | EMAIL_CONFLICT                | Email 重複（忽略大小寫）                   |
| 409  | SELF_ADMIN_CHANGE／LAST_ADMIN | 不可停用或降權自己／保留啟用 ADMIN         |
| 413  | PAYLOAD_TOO_LARGE             | JSON 超過 100 KB                           |
| 415  | UNSUPPORTED_MEDIA_TYPE        | 寫入需 application/json                    |
| 422  | VALIDATION_ERROR              | 欄位、UUID、密碼或分頁不合法，拒絕額外欄位 |
| 429  | RATE_LIMITED                  | 超出登入或匿名 Session 建立限制            |
| 500  | INTERNAL_ERROR                | 安全訊息，不揭露內部資訊                   |
| 503  | DATABASE_UNAVAILABLE          | health 的真實 PostgreSQL 查詢失敗          |

認證 DB 故障會使受保護操作失敗並回安全 500，不回退成已登入或假資料。health 200 只表示 DB 可查詢，Migration 完整性另執行 npm run db。

## 使用者管理輸入

新增 JSON：`{ email, displayName, password, role, isActive? }`。Email 最長 254、姓名 trim 後 1–100、初始／新密碼 12–128 字元；role 僅四種列舉，isActive 預設 true。密碼不 trim、不記錄，以 Argon2id 雜湊。

PATCH 至少一個欄位，可提供上述任一欄位。未提供 password／isActive 即保留，不會因只改姓名而重新啟用帳號。改 Email、角色、密碼或啟用狀態時，同一交易遞增 authVersion 並刪除該帳號所有 Session；改自己 Email／密碼後也須重新登入。停用保留 User，不刪除資料。

清單 query：q（姓名／Email，不分大小寫，最長 100）、role、isActive=true|false、page（1–100000，預設 1）、pageSize（1–100，預設 20）。data：`{ items, total, page, pageSize }`，排序 createdAt DESC、id ASC。

## 驗證與測試

```sh
npm test
npm run test:integration
```

一般測試於 fixture repository 與 fetch 邊界隔離；runtime 沒有 Mock。整合測試經真實 Prisma、PostgreSQL 與 HTTP middleware，驗證四角色、登入失敗、CSRF、限流、停用多 Session、改密碼與登入／停用競爭。數量與命令結果見 ACCEPTANCE。Swagger Cookie 由瀏覽器管理；寫入需先取 CSRF，勿將真實密碼貼到共享文件。
