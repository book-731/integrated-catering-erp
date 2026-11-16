# 餐點照片本機上傳與存檔 API — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在後端補齊餐點照片上傳、讀取與刪除 API，將 JPG／PNG／WebP 圖檔存在專案 `work/uploads/menu-items/`，沿用 `MenuItem.imageUrl` 欄位關聯並確保舊檔清理與安全驗證。

**Architecture:** 新增獨立的 `MenuImageStorage` 類別負責魔術位元組檢測、UUID 檔名產生、防路徑穿越讀寫與刪檔；擴充 `auth.middleware.ts` 的 `protectCsrf` 支援自訂 `Content-Type`；在 `catalog` 模組掛載 `GET /images/:filename`、`POST /:id/image`（`express.raw` 上限 2 MB）與 `DELETE /:id/image`，並讓 `createApp` 支援注入暫存儲存實例供整合測試隔離。

**Tech Stack:** Express 5、TypeScript、Zod 4、Prisma 7、Vitest、Supertest、Node.js `node:fs/promises` / `node:crypto` / `node:path`。

**Spec:** `docs/superpowers/specs/2026-11-17-menu-item-image-upload-design.md`

## Global Constraints

- **不動前端**：不得修改 `apps/frontend/` 任何檔案。
- **不改資料庫 Schema／不加 Migration**：繼續使用現有 `MenuItem.imageUrl`（`@db.VarChar(2048)`）。
- **零新增依賴**：不修改 `package.json` 或 `package-lock.json`（不使用 `multer` 等套件），使用 Express 5 內建 `express.raw()`。
- **儲存位置**：預設 `<repo-root>/work/uploads/menu-items/`（以 `import.meta.url` 解析專案根目錄，不依賴 `process.cwd()`），可由選填 `UPLOAD_DIR` 環境變數覆寫。
- **格式與大小限制**：僅支援 `image/jpeg`（`.jpg`）、`image/png`（`.png`）、`image/webp`（`.webp`），上限 `2mb`，必須比對魔術位元組且須與宣告的 `Content-Type` 一致。
- **權限與安全**：寫／刪限 `ADMIN`、`MANAGER` 且經 `protectCsrfFor`；讀圖限 `menuReadRoles`（四種角色）且須已登入（`401`）；不洩漏伺服器實體路徑；所有錯誤與回應依現有 `{ success, data/error, requestId }` 格式且繁體中文訊息。
- **保留外部 URL 相容**：既有 `POST/PATCH /api/menu-items` 仍只接受無帳密 `HTTP(S)` URL 或 `null`。

## Review Focus

1. `Content-Type` 帶分號參數（如 `image/png; charset=binary`）→ 剝除參數後只比對 media type，正常接受（Task 1 & Task 2 涵蓋）。
2. 偽造 `Content-Type` 或類型不匹配（如 `Content-Type: image/png` 配 JPEG 或純文字位元組）→ 魔術位元組檢查回傳 `422 INVALID_IMAGE_FILE`，不存檔（Task 1 & Task 3 涵蓋）。
3. 超過 `2mb` 的檔案送到 `POST /:id/image` → 回傳 `413 PAYLOAD_TOO_LARGE`，硬碟不留檔（Task 3 涵蓋）。
4. `PATCH /api/menu-items/:id` 只改名稱／價格（未傳 `imageUrl`）→ 原站內照片路徑與硬碟檔案必須保留；僅當 `imageUrl` 顯式改成外部 URL 或 `null` 時才清理舊檔（Task 2 & Task 3 涵蓋）。
5. `GET /api/menu-items/images/:filename` 收到 `../`、非小寫 UUID 或未知副檔名 → 回傳 `404 NOT_FOUND`，不觸及磁碟上層目錄（Task 1 & Task 3 涵蓋）。

---

### Task 1: 環境變數 `UPLOAD_DIR` 與圖片儲存／驗證模組

**Files:**
- Modify: `apps/backend/src/config/env.ts:1-52`
- Create: `apps/backend/src/modules/catalog/menu-image-storage.ts`
- Test: `apps/backend/tests/menu-image-storage.test.ts`

**Interfaces:**
- Produces（`apps/backend/src/config/env.ts`）:
  - `env.UPLOAD_DIR?: string`（選填，`.trim().min(1).optional()`）。
- Produces（`apps/backend/src/modules/catalog/menu-image-storage.ts`）:
  - `export const MENU_IMAGE_MAX_BYTES = 2 * 1024 * 1024`
  - `export const MENU_IMAGE_URL_PREFIX = '/api/menu-items/images/'`
  - `export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const`
  - `export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number]`
  - `export type DetectedMenuImage = { mimeType: AllowedImageMimeType; ext: 'jpg' | 'png' | 'webp' }`
  - `export function normalizeMediaType(contentType: string | undefined): string | undefined` — 取分號前並轉小寫 trim。
  - `export function detectMenuImageFormat(contentType: string | undefined, buffer: Buffer): DetectedMenuImage` — 非允許 MIME 拋 `ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', ...)`；空 Buffer（`length === 0`）拋 `ApiError(400, 'VALIDATION_ERROR', '請提供有效的圖片檔案內容。')`；魔術位元組不符合或與宣告 MIME 不一致拋 `ApiError(422, 'INVALID_IMAGE_FILE', '僅支援有效的 JPG、PNG 或 WebP 圖片檔案。')`。
  - `export function parseLocalMenuImageFilename(imageUrl: string | null | undefined): string | null` — 僅當符合 `/api/menu-items/images/<uuid>.(jpg|png|webp)`（小寫 UUID v4/標準 hex）時回傳檔名，否則回 `null`。
  - `export function validateMenuImageFilename(filename: string): { filename: string; mimeType: AllowedImageMimeType }` — 不符 `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/` 拋 `ApiError(404, 'RESOURCE_NOT_FOUND', '找不到餐點圖片。')`。
  - `export function defaultUploadRoot(): string` — 用 `fileURLToPath(new URL('../../../../../work/uploads', import.meta.url))` 定位 `<repo-root>/work/uploads`。
  - `export class MenuImageStorage`：
    - `constructor(uploadRoot = env.UPLOAD_DIR ?? defaultUploadRoot())`（`private readonly menuDir = path.resolve(uploadRoot, 'menu-items')`）
    - `async save(contentType: string | undefined, buffer: Buffer): Promise<{ filename: string; imageUrl: string; mimeType: AllowedImageMimeType }>` — 呼叫 `detectMenuImageFormat`，以 `randomUUID()` 建檔名，寫入 `menuDir`（先 `mkdir(menuDir, { recursive: true })`）。
    - `async read(filename: string): Promise<{ buffer: Buffer; mimeType: AllowedImageMimeType }>` — 先驗 `validateMenuImageFilename` 與 `path.resolve(menuDir, filename)` 確認前綴在 `menuDir + path.sep` 內；讀檔遇 `ENOENT` 拋 `ApiError(404, 'RESOURCE_NOT_FOUND', '找不到餐點圖片。')`。
    - `async deleteFilename(filename: string): Promise<void>` — 驗檔名後 `unlink`，忽略 `ENOENT`。
    - `async deleteByImageUrlQuietly(imageUrl: string | null | undefined): Promise<void>` — 解析站內檔名後刪除；非站內路徑或 `ENOENT` 直接返回，其他錯誤用 `console.warn(JSON.stringify({ level: 'warn', code: 'MENU_IMAGE_CLEANUP_FAILED' }))` 記錄不拋出。

- [ ] **Step 1: 寫失敗單元測試 `apps/backend/tests/menu-image-storage.test.ts`**

測試不依賴資料庫與 `.env`：透過傳入 `mkdtempSync(path.join(os.tmpdir(), 'erp-img-'))` 測試 `MenuImageStorage`，`afterAll` 清理暫存資料夾。涵蓋：
1. `detectMenuImageFormat`：辨識真實 JPEG（`FF D8 FF ...`）、PNG（`89 50 4E 47 0D 0A 1A 0A ...`）、WebP（`RIFF....WEBP`）、帶參數 `Content-Type: image/jpeg; charset=binary`。
2. `detectMenuImageFormat` 拒絕案例：`text/plain` 或缺 Content-Type（415）、空 Buffer（400）、Content-Type 為 `image/png` 但內容是 JPEG 或文字或 GIF/SVG（422）。
3. `validateMenuImageFilename` 與 `parseLocalMenuImageFilename`：拒絕 `../x.jpg`、大寫 UUID、`.svg`、非 `/api/menu-items/images/` 外部網址；接受合法小寫 UUID + `jpg|png|webp`。
4. `MenuImageStorage.save` / `read` / `deleteFilename` / `deleteByImageUrlQuietly`：寫入後讀回相同 bytes 與 MIME、刪除後再讀拋 404、對外部 URL 或不存在檔名清理不報錯。

- [ ] **Step 2: 執行確認失敗**

Run: `npm test -w @erp/backend -- tests/menu-image-storage.test.ts`
Expected: FAIL（找不到 `menu-image-storage.js`）

- [ ] **Step 3: 實作 `env.ts` 的 `UPLOAD_DIR` 與 `menu-image-storage.ts`**

在 `apps/backend/src/config/env.ts` 的 schema 加上 `UPLOAD_DIR: z.string().trim().min(1).optional()`；在 `menu-image-storage.ts` 實作上述介面，注意不把任何環境變數密碼或實體絕對路徑放進錯誤訊息。

- [ ] **Step 4: 執行確認通過與排版**

Run: `npm test -w @erp/backend -- tests/menu-image-storage.test.ts`
Expected: PASS（全部單元測試通過，無警告）

- [ ] **Step 5: Commit**

```bash
npm run format
git add apps/backend/src/config/env.ts apps/backend/src/modules/catalog/menu-image-storage.ts apps/backend/tests/menu-image-storage.test.ts
git commit -m "feat(catalog): 新增餐點圖片本機儲存與魔術位元組驗證模組"
```

---

### Task 2: CSRF 擴充、Repository／Service／Controller／Routes 串接與單元測試

**Files:**
- Modify: `apps/backend/src/modules/auth/auth.middleware.ts:57-78`
- Modify: `apps/backend/src/modules/catalog/catalog.repository.ts:213-236`（修改 `updateMenu` 並新增 `setMenuImage`）
- Modify: `apps/backend/src/modules/catalog/catalog.service.ts:64-105`（改 `updateMenu`、新增 `uploadMenuImage` / `deleteMenuImage` / `readMenuImage`）
- Modify: `apps/backend/src/modules/catalog/catalog.controller.ts:1-128`
- Modify: `apps/backend/src/modules/catalog/catalog.routes.ts:1-81`
- Modify: `apps/backend/src/app.ts:17-55`
- Test: `apps/backend/tests/catalog-image.test.ts`

**Interfaces:**
- Produces（`auth.middleware.ts`）：
  - `export function protectCsrfFor(allowedMediaTypes?: readonly string[]): RequestHandler` — 驗證 `Origin` 與 `X-CSRF-Token`；僅當 `allowedMediaTypes && allowedMediaTypes.length > 0` 時比對 `normalizeMediaType(request.get('Content-Type'))` 是否在清單內，否則回 `ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', ...)`。
  - `export const protectCsrf: RequestHandler = protectCsrfFor(['application/json'])`（保持既有匯出與行為完全不變）。
- Produces（`catalog.repository.ts`）：
  - `updateMenu(actor: Actor, id: string, input: MenuUpdate): Promise<{ item: MenuRecord; previousImageUrl: string | null }>`
  - `setMenuImage(actor: Actor, id: string, imageUrl: string | null): Promise<{ item: MenuRecord; previousImageUrl: string | null }>` — 在 `this.write(actor, ...)` 交易內查 `tx.menuItem.findUnique({ where: { id } })`（不存在拋 `missing('餐點')`），更新 `imageUrl` 並回傳 `{ item, previousImageUrl: current.imageUrl }`。
- Produces（`catalog.service.ts`）：
  - `constructor(private readonly repository = catalogRepository, private readonly imageStorage = new MenuImageStorage())`
  - `uploadMenuImage(actor: Actor, id: string, contentType: string | undefined, buffer: Buffer)`：先 `await this.repository.menuItem(id)` 確認餐點存在、存檔 `await this.imageStorage.save(contentType, buffer)`（先驗證再寫檔；注意若驗證失敗不會寫檔，若 `setMenuImage` 失敗則 `deleteFilename` 回滾新檔），成功後若 `previousImageUrl !== item.imageUrl` 呼叫 `deleteByImageUrlQuietly(previousImageUrl)`，回傳 `menuDto(item)`。
  - `deleteMenuImage(actor: Actor, id: string)`：呼叫 `setMenuImage(actor, id, null)`，若 `previousImageUrl` 非空則呼叫 `deleteByImageUrlQuietly(previousImageUrl)`，回傳 `menuDto(item)`。
  - `readMenuImage(filename: string)`：委派 `this.imageStorage.read(filename)`。
  - `updateMenu(actor, id, input)`：若 `input.imageUrl !== undefined && previousImageUrl !== item.imageUrl`，呼叫 `deleteByImageUrlQuietly(previousImageUrl)`。
- Produces（`catalog.routes.ts` & `app.ts`）：
  - `catalogRoutes(repository: AuthRepository, imageStorage?: MenuImageStorage)`；`createApp(dependencies: { healthRepository?: HealthRepository; authRepository?: AuthRepository; menuImageStorage?: MenuImageStorage } = {})`。
  - `menu` router 順序：
    1. `menu.get('/images/:filename', controller.menuImage)`（必須在 `/:id` 之前）
    2. 既有 `GET /`、`GET /:id`、`GET /:id/recipe`、`GET /:id/ingredient-availability`
    3. `menu.post('/:id/image', requireRoles(...catalogWriteRoles), protectCsrfFor(ALLOWED_IMAGE_MIME_TYPES), express.raw({ type: [...ALLOWED_IMAGE_MIME_TYPES], limit: MENU_IMAGE_MAX_BYTES }), controller.uploadMenuImage)`
    4. `menu.delete('/:id/image', requireRoles(...catalogWriteRoles), protectCsrfFor(), controller.deleteMenuImage)`
    5. 既有 `POST /`、`PATCH /:id`、`PUT /:id/recipe`
  - `controller.menuImage` 設定回應標頭：`Content-Type: mimeType`、`Content-Disposition: inline`、`X-Content-Type-Options: nosniff`、`Cache-Control: private, max-age=31536000, immutable` 並 `response.send(buffer)`。

- [ ] **Step 1: 寫失敗單元測試 `apps/backend/tests/catalog-image.test.ts`**

用 Supertest（搭配 `createApp({ menuImageStorage })` 與假 `AuthRepository` 或直接測 `CatalogService` + fake repository，無須連資料庫）測試：
1. `protectCsrfFor`：`['application/json']` 拒絕 `text/plain`（415）、`protectCsrfFor()` 允許無 `Content-Type` 的 `DELETE` 但無效 CSRF token 仍回 403、`protectCsrfFor(ALLOWED_IMAGE_MIME_TYPES)` 接受 `image/png; charset=binary`。
2. `CatalogService.uploadMenuImage`：
   - 資料庫寫入失敗時，剛存入暫存資料夾的新圖檔會被立即刪除（磁碟無殘留）。
   - 替換原本有本機圖片的餐點時，舊圖檔會被刪除、新圖檔保留。
   - 替換原本是外部 `https://...` 的餐點時，不會誤刪也不報錯。
   - 目標餐點不存在（`404`）時，不會在磁碟寫入檔案。
3. `CatalogService.updateMenu`：僅改 `name`（未傳 `imageUrl`）時不刪除既有本機圖檔；`imageUrl` 改為 `null` 或外部 URL 時刪除舊本機圖檔。
4. `CatalogService.deleteMenuImage`：呼叫 `setMenuImage(actor, id, null)` 並清除本機舊檔。

- [ ] **Step 2: 執行確認失敗**

Run: `npm test -w @erp/backend -- tests/catalog-image.test.ts`
Expected: FAIL（`protectCsrfFor` 與 `uploadMenuImage` 尚未實作）

- [ ] **Step 3: 實作 `auth.middleware.ts`、`catalog.repository.ts`、`catalog.service.ts`、`catalog.controller.ts`、`catalog.routes.ts`、`app.ts`**

依照上述 Interfaces 實作；注意 `catalog.controller.ts` 中 `uploadMenuImage` 若 `Buffer.isBuffer(request.body)` 為 false 時回傳 `new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', '僅支援 JPG、PNG 或 WebP 圖片檔案。')`。

- [ ] **Step 4: 執行單元測試與型別檢查**

Run: `npm test --workspaces && npm run typecheck`
Expected: 全部 PASS，無錯誤或警告。

- [ ] **Step 5: Commit**

```bash
npm run format
git add apps/backend/src/modules/auth/auth.middleware.ts apps/backend/src/modules/catalog/catalog.repository.ts apps/backend/src/modules/catalog/catalog.service.ts apps/backend/src/modules/catalog/catalog.controller.ts apps/backend/src/modules/catalog/catalog.routes.ts apps/backend/src/app.ts apps/backend/tests/catalog-image.test.ts
git commit -m "feat(catalog): 實作餐點照片上傳、刪除與讀取 API 端點"
```

---

### Task 3: 真實 PostgreSQL 整合測試、OpenAPI 與文件更新

**Files:**
- Create: `apps/backend/tests/catalog-image.integration.test.ts`
- Modify: `apps/backend/src/modules/catalog/catalog.openapi.ts`
- Modify: `docs/API.md`
- Modify: `docs/KNOWN_LIMITATIONS.md`
- Modify: `docs/PROGRESS.md`

**Interfaces:**
- Consumes: Task 1 的 `MenuImageStorage`、Task 2 的 `createApp({ authRepository, menuImageStorage })`。
- OpenAPI 更新（`catalog.openapi.ts`）：
  - `menuFields.imageUrl` 移除 `format: 'uri'` 限制（因包含站內相對路徑 `/api/menu-items/images/...`）並更新 description。
  - 新增 `'/menu-items/{id}/image'`（`post` 含 `requestBody` binary `image/jpeg`、`image/png`、`image/webp`，回應 200 `{ menuItem }` 與 413/415/422 說明；`delete` 回應 200 `{ menuItem }`）與 `'/menu-items/images/{filename}'`（`get` 回應 200 binary `image/*` 與 401/403/404）。

- [ ] **Step 1: 寫失敗整合測試 `apps/backend/tests/catalog-image.integration.test.ts`**

比照 `catalog.integration.test.ts` 隔離建置帳號（四角色）、暫存分類與餐點並在 `afterAll` 清除資料庫資料及 `rmSync` 暫存 `UPLOAD_DIR`。涵蓋所有規格完成標準：
1. `ADMIN`／`MANAGER` 上傳有效 JPG、PNG、WebP 皆回 `200`，`menuItem.imageUrl` 為 `/api/menu-items/images/<uuid>.<ext>`，且磁碟確有該檔案；重複 GET `/api/menu-items/:id` 仍相同。
2. 四種登入角色（含 `CASHIER`、`KITCHEN`）皆可 `GET` 讀回完全一致的二進位內容，並檢查 `Content-Type`、`Content-Disposition: inline`、`X-Content-Type-Options: nosniff`、`Cache-Control` 含 `private`；未登入（新 agent）`GET` 回 `401`。
3. 權限／安全／錯誤邊界：`CASHIER`、`KITCHEN` 呼叫 `POST`/`DELETE /:id/image` 回 `403`；缺 CSRF token 回 `403`；超過 2 MB 回 `413`；`Content-Type: text/plain` 回 `415`；假 PNG 標頭配純文字回 `422`；餐點不存在回 `404`（且暫存資料夾未新增檔案）；路徑穿越或非法檔名 `GET` 回 `404`。
4. 檔案生命週期：上傳第二張圖片取代第一張後，舊檔從暫存資料夾消失、只留新檔；`DELETE /api/menu-items/:id/image` 將 `imageUrl` 設回 `null` 並刪除硬碟檔案；再重新上傳後用 `PATCH /api/menu-items/:id` 改為 `{ imageUrl: 'https://example.test/ext.jpg' }` 或 `{ imageUrl: null }` 亦刪除舊本機圖檔；只改 `name` 則保留本機圖檔。

- [ ] **Step 2: 執行確認測試可跑並檢查當前狀態**

Run: `npm run test:integration`（先確認新整合測試除了尚未補的 OpenAPI 斷言外是否通過，若加入 OpenAPI spec 斷言則會先紅再綠）
在測試檔補一個斷言檢查 `/api/openapi.json` 的 `paths` 包含 `'/menu-items/{id}/image'`（`post`、`delete`）與 `'/menu-items/images/{filename}'`（`get`），執行確認 RED。

- [ ] **Step 3: 更新 `catalog.openapi.ts` 與專案文件**

- 更新 `apps/backend/src/modules/catalog/catalog.openapi.ts`。
- 更新 `docs/API.md`（在「食材、分類、餐點與配方」表格與「分類與餐點格式」補上三個新端點與 `imageUrl` 說明）。
- 更新 `docs/KNOWN_LIMITATIONS.md` 第 8 行，改為說明後端已提供本機圖片上傳與讀取 API（存於 `work/uploads/menu-items/`），前端上傳介面待串接。
- 更新 `docs/PROGRESS.md` 最上方補記「餐點照片後端本機上傳與讀取 API」進度。

- [ ] **Step 4: 全套驗收指令**

Run:
```powershell
npm run format:check
npm run check
npm run test:integration
npm run db
```
Expected: 全部通過，exit code 0，`work/uploads` 無測試殘留檔案。

- [ ] **Step 5: Commit**

```bash
npm run format
git add apps/backend/src/modules/catalog/catalog.openapi.ts apps/backend/tests/catalog-image.integration.test.ts docs/API.md docs/KNOWN_LIMITATIONS.md docs/PROGRESS.md
git commit -m "docs(catalog): 補齊餐點照片 API 整合測試與 OpenAPI／專案文件"
```
