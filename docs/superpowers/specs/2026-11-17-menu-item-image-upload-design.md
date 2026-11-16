# 餐點照片本機上傳與存檔 API — 設計文件

日期：2026-11-17｜負責：後端／資料庫｜規模：專案功能（後端 API 與檔案儲存）

## 目的與原因

目前系統的餐點資料表已經有 `MenuItem.imageUrl` 欄位，但後端只接受外部 `http(s)://` 網址，沒有上傳與存檔功能（見 `docs/KNOWN_LIMITATIONS.md` 與 `docs/PHASE2B-DECISIONS.md`）。然而本套 ERP 的實際使用情境是單店單機運作，若菜單照片依賴外部網址，在離線或外鏈失效時圖片就會無法顯示。

本設計在後端補齊「餐點照片本機上傳、刪除與讀取」API，將圖檔儲存在專案本地目錄內並沿用現有 `imageUrl` 欄位關聯，滿足需求項目「2. 菜單與商品管理 — 餐點基本資料：名稱／價格／照片／狀態」。

## 目標

- 提供後端 API 讓管理員／店長能為指定餐點上傳照片、替換照片與移除照片，並將圖片儲存在本機專案目錄內。
- 提供後端讀圖端點，讓已登入的菜單可讀角色（四種角色皆可）能透過同源 `/api/...` 路徑讀取餐點照片，相容現有 Vite dev proxy、Docker Nginx `/api/` 轉送與 Helmet 安全標頭。
- 寫入 `MenuItem.imageUrl` 後，既有的 `GET /api/menu-items`、`GET /api/menu-items/:id` 及前端 `MealImage`（`<img src={url}>`）無須改動介面即可直接使用。
- 保留既有的外部 `HTTP(S)` 圖片 URL 支援與驗證，確保既有整合／單元測試與相容性不受影響。
- 補齊 OpenAPI（Swagger）文件、既有文件更新與完整的單元／整合測試。

## 不做的事與反目標

- **不動前端介面**：使用者明確要求責任不越界，本次不修改 `apps/frontend/` 的頁面、表單或測試（留給前端組員後續串接）。
- **不改資料庫 Schema／不加 Migration**：繼續沿用現有 `MenuItem.imageUrl`（`@db.VarChar(2048)`）；相對於 URL 最大長度 2048，本機路徑 `/api/menu-items/images/<uuid>.<ext>` 約 63 字元，完全足夠。
- **不把圖片轉 Base64 存進 PostgreSQL**：避免資料庫體積膨脹與查詢變慢。
- **不支援動畫／危險格式**：不接受 SVG（有 XSS 風險）、GIF 或任意未驗證檔案；不依賴使用者傳入的檔名或 `Content-Type` 單獨判斷格式。
- **不留下孤兒圖檔**：替換照片、移除照片或透過 `PATCH /api/menu-items/:id` 把本機圖檔改為外部 URL 或 `null` 時，必須清理原本在本機的舊圖檔（盡力刪除並容許舊檔已不存在，不因刪檔失敗而讓已提交的資料庫寫入失敗）。

## 限制條件

- **技術棧與依賴**：沿用 Express 5、TypeScript、Zod、Prisma 7、Vitest；**不新增第三方上傳套件**（如 `multer`），使用 Express 5 內建 `express.raw()` 搭配 Node.js 內建 `node:fs/promises` 與 `node:crypto`。
- **權限與安全**：
  - 上傳與刪除圖片比照 `catalogWriteRoles`（僅 `ADMIN`、`MANAGER`），並套用 `session`、`requireAuthenticated` 與 `protectCsrf`。
  - 讀取圖片比照 `menuReadRoles`（`ADMIN`、`MANAGER`、`CASHIER`、`KITCHEN`），須通過 `session` 與 `requireAuthenticated`（同源瀏覽器 `<img>` 會自動帶上 Session Cookie，避免未登入隨意存取圖片）。
  - 防範路徑穿越（Path Traversal）：讀圖只接受嚴格 UUID 檔名，並檢查解析後的實體路徑位於上傳根目錄之內。
  - 防範偽造 MIME：寫檔前必須檢查檔案開頭的魔術位元組（Magic Bytes），並由檢測到的真實圖片類型決定儲存副檔名與讀圖回應的 `Content-Type`。
- **儲存位置**：圖片存放在 `<repo-root>/work/uploads/menu-items/`（`work/` 已被 `.gitignore` 忽略，不會被 commit 進 Git）。另提供選填環境變數 `UPLOAD_DIR` 覆寫根目錄（供測試隔離使用，避免測試汙染開發環境目錄）。
- **既有程式碼相容**：`app.ts` 全域的 `express.json({ limit: '100kb' })` 維持不變；僅在圖片上傳路由掛載較大的 raw body parser（上限 `2mb`）。

## 考慮過的方案

| 方案 | 做法 | 取捨 |
|---|---|---|
| **A（採用）** | `POST /api/menu-items/:id/image` 綁定餐點上傳，使用 Express 原生 `express.raw()` 收二進位圖檔，搭配 `DELETE /:id/image` 與 `GET /images/:filename` | 零新增套件；綁定餐點 ID 管理檔名，不產生未建檔取消的孤兒圖；換圖自動清舊檔；既有 `POST/PATCH /api/menu-items` 不必放寬站內相對路徑寫入。缺點是前端新建餐點加圖需先建餐點再傳圖（兩段請求），且送檔用 raw `File` body 而非 `FormData` |
| B | 新增 `POST /api/menu-items/images` 搭配 `multer` 收 `FormData`，回傳路徑再由一般 CRUD 寫入 `imageUrl` | 符合 `FormData` 慣例且可單步建檔；但需新增 `multer`，容易殘留取消建檔或換圖後的孤兒檔案，且必須放寬一般更新 API 接收站內路徑並防偽造 |
| C | `POST /api/menu-items/:id/image` 搭配 `multer` 收 `FormData` | 兼具無孤兒檔與 `FormData`；但需多裝 `multer` 與型別套件，仍為兩段請求 |

使用者選 **方案 A**。

## 設計細節

### 1. API 端點規格（掛載於 `/api/menu-items`）

注意路由註冊順序：`/images/:filename` 必須註冊在 `/:id` 之前，避免路由順序造成混淆。

1. **上傳／替換餐點照片：`POST /api/menu-items/:id/image`**
   - **權限**：`ADMIN`、`MANAGER`，需帶 `X-CSRF-Token` 與允許的 `Origin`。
   - **請求格式**：
     - `Content-Type` 須為 `image/jpeg`、`image/png` 或 `image/webp`（不含參數的媒體類型比對；不符時回 `415 UNSUPPORTED_MEDIA_TYPE`）。
     - Body 解析器：`express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '2mb' })`。超過 2 MB 由 Express 拋出 `entity.too.large`，經現有 `errorHandler` 回傳 `413 PAYLOAD_TOO_LARGE`。
     - 若 body 非 `Buffer` 或長度為 `0`：回傳 `400 VALIDATION_ERROR`（或 `415` 若 Content-Type 非允許圖片類型）。
   - **格式與魔術位元組驗證**：
     - JPEG：`FF D8 FF`
     - PNG：`89 50 4E 47 0D 0A 1A 0A`
     - WebP：`0..3` 為 `RIFF`（`52 49 46 46`）且 `8..11` 為 `WEBP`（`57 45 42 50`），總長度至少 12 bytes
     - 不符合以上任何一種真實格式，或宣告的 `Content-Type` 與實際檔案魔術位元組不一致時，回傳 `422 INVALID_IMAGE_FILE`（明確提示僅支援 JPG、PNG、WebP 有效圖檔）。
   - **交易與檔案生命週期順序**：
     1. 驗證 `:id` 為合法 UUID、驗證圖片 Buffer 與魔術位元組；確認目標餐點存在（`404` 若無）。
     2. 產生隨機 UUID 檔名 `<fileUuid>.<ext>`（`jpg` / `png` / `webp`），先寫入 `<uploadRoot>/menu-items/<fileUuid>.<ext>`（確保目錄存在 `mkdir(..., { recursive: true })`）。
     3. 在資料庫交易內寫入 `MenuItem.imageUrl = '/api/menu-items/images/<fileUuid>.<ext>'` 並寫入稽核日誌（沿用 `catalogRepository` 的 `write` 模式，或專責方法同時回傳舊 `imageUrl` 與更新後的 `MenuItem`）；**若資料庫寫入失敗，在 catch 中刪除剛剛寫入的新圖檔**，不留垃圾檔案。
     4. 若資料庫更新成功，且舊的 `imageUrl` 是本機站內圖片路徑（符合 `/api/menu-items/images/<uuid>.<ext>`），於交易成功後非同步／安全地刪除舊圖檔（若舊檔已不存在 `ENOENT` 則忽略，其他刪檔錯誤記錄 warning 但不讓 API 失敗）。
   - **回應**：`200 OK`，標準 `{ success: true, data: { menuItem }, requestId }` envelope，與 `PATCH /api/menu-items/:id` 回應格式完全相同。

2. **移除餐點照片：`DELETE /api/menu-items/:id/image`**
   - **權限**：`ADMIN`、`MANAGER`，需帶 `X-CSRF-Token` 與允許的 `Origin`。
   - **行為**：
     1. 驗證 `:id` 為合法 UUID；若餐點不存在回 `404`。
     2. 在資料庫交易內將 `MenuItem.imageUrl` 設為 `null`（並紀錄稽核日誌）；若原本就是 `null`，仍可視為冪等成功回 `200`（保留當前 `menuItem`）。
     3. 若原本的 `imageUrl` 是本機圖片路徑，資料庫提交成功後刪除對應檔案（忽略 `ENOENT`）。
   - **回應**：`200 OK`，標準 `{ success: true, data: { menuItem }, requestId }` envelope。

3. **讀取餐點照片：`GET /api/menu-items/images/:filename`**
   - **權限**：`ADMIN`、`MANAGER`、`CASHIER`、`KITCHEN`（即 `menuReadRoles`），需已登入 Session。
   - **路徑驗證**：`:filename` 須嚴格符合 `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/`（小寫 UUID + 允許副檔名），不符直接回 `404`（或 `400`；回 `404 NOT_FOUND` 較不會洩漏儲存規則）。檢查 `path.resolve` 確實落在儲存目錄內。
   - **回應**：
     - 檔案不存在時回 `404 NOT_FOUND`。
     - 存在時回 `200 OK`，`Content-Type` 依副檔名設為 `image/jpeg` / `image/png` / `image/webp`、`Content-Disposition: inline`、`X-Content-Type-Options: nosniff`、`Cache-Control: private, max-age=31536000, immutable`（因每次上傳都是全新 UUID 檔名，可安全快取於已登入瀏覽器中，覆蓋 `/api` 預設的 `no-store`）。

### 2. 與既有 `PATCH /api/menu-items/:id` 的連動

- `catalog.validation.ts` 的 `menuCreateSchema` / `menuUpdateSchema` 維持只接受無帳密 `http(s)://` URL 或 `null`，不開放前端直接填入站內 `/api/menu-items/images/...` 偽造路徑。
- 當管理者透過 `PATCH /api/menu-items/:id` 將已有本機圖片的餐點改為外部 `https://...` URL 或 `null` 時，`updateMenu` 提交成功後也應清理原本的本機舊圖檔。
- 若因並發或同一圖片想再次透過 `PATCH` 原樣送回原本的 `/api/menu-items/images/...` 怎麼辦？注意：目前前端「編輯餐點」表單打開時會把 `item.imageUrl` 帶入狀態，若前端未改動前端程式碼，在前端更新前如果編輯餐點其他欄位可能會觸發前端表單驗證擋下 `/api/...`；此為前端接手時須處理的部分（不屬於本次後端範圍）。不過在後端 `PATCH /api/menu-items/:id` 仍維持原樣，不對外部寫入開放站內路徑；或者後端僅在「`imageUrl` 確實被改為與原本不同的值（含 `null` 或外部 URL）」時才清理舊本機圖檔。

### 3. 環境設定與儲存模組

- **環境變數**（`apps/backend/src/config/env.ts`）：新增選填 `UPLOAD_DIR: z.string().trim().min(1).optional()`，未設定時預設解析為專案根目錄下的 `work/uploads`（以 `import.meta.url` 相對定位，不依賴 `process.cwd()` 隨啟動目錄飄移）。
- **獨立儲存與驗證模組**（例如 `apps/backend/src/modules/catalog/menu-image-storage.ts` 或 `apps/backend/src/lib/menu-image-storage.ts`）：
  - 負責：魔術位元組格式偵測（與 `Content-Type` 一致性檢查）、產生安全路徑與檔名、寫入檔案、讀取檔案／路徑解析、從本機 `/api/menu-items/images/...` 解析檔名並刪除檔案。
  - 與 Express / Prisma 解耦，方便單元測試涵蓋各種畸形檔頭與路徑穿越測試。

### 4. OpenAPI 與專案文件

- 更新 `apps/backend/src/modules/catalog/catalog.openapi.ts`：
  - `menuFields.imageUrl` 說明補充「可為無帳密 HTTP(S) URL 或本系統上傳端點產生的站內圖片路徑 `/api/menu-items/images/...`」。
  - 補齊 `POST /menu-items/{id}/image`、`DELETE /menu-items/{id}/image`、`GET /menu-items/images/{filename}` 三個端點的 OpenAPI 定義（含 CSRF header、binary requestBody 與回應格式）。
- 更新 `docs/API.md`、`docs/KNOWN_LIMITATIONS.md`、`docs/PROGRESS.md` 中「尚未提供圖片上傳」的過時描述，精確反映「後端已提供本機圖片上傳與讀取 API；前端上傳介面待串接」。

## 留給實作者決定

- 儲存模組的確切檔名與放置位置（`src/lib/` 或 `src/modules/catalog/`）。
- `POST /api/menu-items/:id/image` 若 `Content-Type` 不符（例如送 `application/json`）是在 route middleware 階段擋下回 `415`，還是在 controller 檢查 `Buffer.isBuffer(request.body)` 後統一回 `415`。
- 停用餐點（`isActive: false`）時保留既有照片不刪除，因為停用設計原則為保留歷史關聯與資料；是否允許對已停用餐點上傳照片由實作者依 `updateMenu` 一致性決定（建議允許或維持單純檢查餐點存在即可，不綁 `isActive`）。

## 完成標準

- **單元測試**涵蓋：
  - JPEG／PNG／WebP 魔術位元組正確辨識、空檔案、偽造副檔名／假 `Content-Type`、不支援格式（如 GIF／SVG／純文字）。
  - 檔名格式驗證與路徑穿越（`../`、非 UUID、未知副檔名）被安全拒絕。
  - `UPLOAD_DIR` 寫檔、讀檔、刪除與忽略 `ENOENT`。
- **整合測試**（真實 PostgreSQL + Express App + 暫存 `UPLOAD_DIR`）涵蓋：
  - `ADMIN` / `MANAGER` 可成功上傳 JPG/PNG/WebP 並取得 `/api/menu-items/images/...`，四種角色皆可 `GET` 讀回完全一致的二進位內容與正確 `Content-Type` / `nosniff` 標頭；未登入讀圖回 `401`。
  - `CASHIER` / `KITCHEN` 上傳或刪除圖片回 `403`；未帶 CSRF token 回 `403`；超過 2 MB 回 `413`；假圖片回 `422`；餐點不存在回 `404`（且硬碟不可留下檔案）。
  - 替換圖片時舊檔被清除、新檔存在；`DELETE /api/menu-items/:id/image` 將 `imageUrl` 設回 `null` 並清除硬碟檔案；`PATCH /api/menu-items/:id` 改回 `null` 或外部 URL 時亦清除舊本機圖檔。
- 既有後端與前端測試全數通過（`npm run check`、`npm run test:integration`）。
