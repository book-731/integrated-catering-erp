import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { env } from '../src/config/env.js';
import { hashPassword } from '../src/modules/auth/password.js';
import { authRepository } from '../src/modules/auth/auth.repository.js';
import { hashToken } from '../src/modules/auth/auth.service.js';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MENU_IMAGE_MAX_BYTES,
  MENU_IMAGE_URL_PREFIX,
  MenuImageStorage,
  parseLocalMenuImageFilename,
} from '../src/modules/catalog/menu-image-storage.js';
import type { AuthRepository } from '../src/modules/auth/auth.repository.interface.js';
import type { Role, StoredUser } from '../src/modules/auth/auth.types.js';

if (process.env.RUN_DB_INTEGRATION !== '1') throw new Error('Use isolated DB integration runner.');

const runId = randomUUID(),
  prefix = `CIMG-${runId.slice(0, 8)}`,
  password = randomBytes(24).toString('base64url');

const userIds: string[] = [],
  categoryIds: string[] = [],
  menuIds: string[] = [];

const sessionIds = new Set<string>(),
  limitKeys = new Set<string>();

const users = new Map<Role, StoredUser>();

const repository: AuthRepository = {
  ...authRepository,
  async consumeLimit(key, now, windowMs) {
    const scoped = hashToken(`${runId}:${key}`);
    limitKeys.add(scoped);
    return authRepository.consumeLimit(scoped, now, windowMs);
  },
  async createAnonymousSession(session) {
    sessionIds.add(session.id);
    await authRepository.createAnonymousSession(session);
  },
  async rotateSession(oldId, user, session) {
    sessionIds.add(session.id);
    return authRepository.rotateSession(oldId, user, session);
  },
};

const tmpUploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-img-int-'));
const storage = new MenuImageStorage(tmpUploadRoot);
const app = createApp({ authRepository: repository, menuImageStorage: storage });

type Login = Awaited<ReturnType<typeof login>>;
let admin: Login, manager: Login, cashier: Login, kitchen: Login;

async function login(role: Role) {
  const user = users.get(role)!;
  const agent = request.agent(app);
  const initial = await agent.get('/api/auth/session').expect(200);
  const response = await agent
    .post('/api/auth/login')
    .set('Origin', env.APP_ORIGIN)
    .set('X-CSRF-Token', initial.body.data.csrfToken)
    .send({ email: user.email, password })
    .expect(200);
  return {
    agent,
    csrf: String(response.body.data.csrfToken),
    actor: { id: user.id, authVersion: user.authVersion },
  };
}

const headers = (session: Login) => ({
  Origin: env.APP_ORIGIN,
  'X-CSRF-Token': session.csrf,
});

async function category() {
  const response = await manager.agent
    .post('/api/menu-categories')
    .set(headers(manager))
    .send({ name: `${prefix}-分類-${randomUUID()}` })
    .expect(201);
  categoryIds.push(String(response.body.data.category.id));
  return response.body.data.category as { id: string; name: string };
}

async function menu() {
  const group = await category();
  const response = await manager.agent
    .post('/api/menu-items')
    .set(headers(manager))
    .send({
      name: `${prefix}-餐點-${randomUUID().slice(0, 8)}`,
      categoryId: group.id,
      price: '120.00',
    })
    .expect(201);
  menuIds.push(String(response.body.data.menuItem.id));
  return response.body.data.menuItem as {
    id: string;
    categoryId: string;
    price: string;
    imageUrl: string | null;
  };
}

const JPEG_FIXTURE = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
]);

const PNG_FIXTURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
]);

const WEBP_FIXTURE = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
  0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

function binaryParser(res: any, callback: (err: Error | null, body: Buffer) => void) {
  const data: Buffer[] = [];
  res.on('data', (chunk: Buffer | string) => {
    data.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'binary'));
  });
  res.on('end', () => callback(null, Buffer.concat(data)));
}

beforeAll(async () => {
  const digest = await hashPassword(password);
  for (const role of ['ADMIN', 'MANAGER', 'CASHIER', 'KITCHEN'] as const) {
    const user = await prisma.user.create({
      data: {
        email: `${role.toLowerCase()}-${runId}@catalog-img.test`,
        displayName: 'CatalogImage測試',
        role,
        passwordHash: digest,
      },
    });
    userIds.push(user.id);
    users.set(role, user);
  }
  admin = await login('ADMIN');
  manager = await login('MANAGER');
  cashier = await login('CASHIER');
  kitchen = await login('KITCHEN');
});

afterAll(async () => {
  await prisma.recipeIngredient.deleteMany({ where: { menuItemId: { in: menuIds } } });
  await prisma.menuItem.deleteMany({ where: { id: { in: menuIds } } });
  await prisma.menuCategory.deleteMany({ where: { id: { in: categoryIds } } });
  await prisma.session.deleteMany({ where: { id: { in: [...sessionIds] } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds }, email: { contains: runId } } });
  await prisma.authRateLimit.deleteMany({ where: { key: { in: [...limitKeys] } } });
  await prisma.$disconnect();
  fs.rmSync(tmpUploadRoot, { recursive: true, force: true });
});

describe('Catalog 餐點圖片上傳、刪除與讀取 API 整合測試', () => {
  describe('1. ADMIN / MANAGER 上傳有效 JPG, PNG, WebP', () => {
    it.each([
      {
        roleName: 'ADMIN',
        getSession: () => admin,
        mimeType: 'image/jpeg',
        fixture: JPEG_FIXTURE,
        ext: 'jpg',
      },
      {
        roleName: 'MANAGER',
        getSession: () => manager,
        mimeType: 'image/png',
        fixture: PNG_FIXTURE,
        ext: 'png',
      },
      {
        roleName: 'ADMIN',
        getSession: () => admin,
        mimeType: 'image/webp',
        fixture: WEBP_FIXTURE,
        ext: 'webp',
      },
    ])(
      '$roleName 可上傳 $mimeType 並持久化至暫存磁碟',
      async ({ getSession, mimeType, fixture, ext }) => {
        const session = getSession();
        const item = await menu();

        const uploadRes = await session.agent
          .post(`/api/menu-items/${item.id}/image`)
          .set(headers(session))
          .set('Content-Type', mimeType)
          .send(fixture)
          .expect(200);

        expect(uploadRes.body.success).toBe(true);
        const returnedItem = uploadRes.body.data.menuItem;
        expect(returnedItem.id).toBe(item.id);
        expect(returnedItem.imageUrl).toMatch(
          new RegExp(`^/api/menu-items/images/[0-9a-f-]{36}\\.${ext}$`),
        );

        const filename = parseLocalMenuImageFilename(returnedItem.imageUrl);
        expect(filename).toBeTruthy();
        const filePath = path.join(tmpUploadRoot, 'menu-items', filename!);
        expect(fs.existsSync(filePath)).toBe(true);
        expect(fs.readFileSync(filePath)).toEqual(fixture);

        // 重複 GET /api/menu-items/:id 仍回傳相同 imageUrl
        const getRes = await session.agent.get(`/api/menu-items/${item.id}`).expect(200);
        expect(getRes.body.data.menuItem.imageUrl).toBe(returnedItem.imageUrl);
      },
    );
  });

  describe('2. 四種角色皆可讀回二進位內容，未登入 401', () => {
    it('四種登入角色皆可讀取圖片二進位內容並具備正確快取與安全性 Header', async () => {
      const item = await menu();
      const uploadRes = await admin.agent
        .post(`/api/menu-items/${item.id}/image`)
        .set(headers(admin))
        .set('Content-Type', 'image/png')
        .send(PNG_FIXTURE)
        .expect(200);

      const filename = parseLocalMenuImageFilename(uploadRes.body.data.menuItem.imageUrl)!;

      for (const currentSession of [admin, manager, cashier, kitchen]) {
        const res = await currentSession.agent
          .get(`/api/menu-items/images/${filename}`)
          .buffer(true)
          .parse(binaryParser)
          .expect(200);

        expect(res.headers['content-type']).toContain('image/png');
        expect(res.headers['content-disposition']).toBe('inline');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['cache-control']).toContain('private');
        expect(res.body.equals(PNG_FIXTURE)).toBe(true);
      }
    });

    it('未登入使用者請求圖片回傳 401 UNAUTHENTICATED', async () => {
      const item = await menu();
      const uploadRes = await admin.agent
        .post(`/api/menu-items/${item.id}/image`)
        .set(headers(admin))
        .set('Content-Type', 'image/jpeg')
        .send(JPEG_FIXTURE)
        .expect(200);

      const filename = parseLocalMenuImageFilename(uploadRes.body.data.menuItem.imageUrl)!;
      const unauthAgent = request(app);
      const res = await unauthAgent.get(`/api/menu-items/images/${filename}`).expect(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('3. 權限、安全與錯誤邊界', () => {
    it('CASHIER 與 KITCHEN 呼叫 POST 與 DELETE /:id/image 回 403 FORBIDDEN', async () => {
      const item = await menu();
      for (const nonWriteSession of [cashier, kitchen]) {
        await nonWriteSession.agent
          .post(`/api/menu-items/${item.id}/image`)
          .set(headers(nonWriteSession))
          .set('Content-Type', 'image/png')
          .send(PNG_FIXTURE)
          .expect(403);

        await nonWriteSession.agent
          .delete(`/api/menu-items/${item.id}/image`)
          .set(headers(nonWriteSession))
          .expect(403);
      }
    });

    it('缺少或無效 CSRF token 呼叫 POST 與 DELETE 回 403 CSRF_INVALID', async () => {
      const item = await menu();

      // POST 缺少 CSRF
      await admin.agent
        .post(`/api/menu-items/${item.id}/image`)
        .set('Origin', env.APP_ORIGIN)
        .set('Content-Type', 'image/png')
        .send(PNG_FIXTURE)
        .expect(403);

      // POST CSRF 錯誤
      await admin.agent
        .post(`/api/menu-items/${item.id}/image`)
        .set('Origin', env.APP_ORIGIN)
        .set('X-CSRF-Token', 'invalid-token-here')
        .set('Content-Type', 'image/png')
        .send(PNG_FIXTURE)
        .expect(403);

      // DELETE 缺少 CSRF
      await admin.agent
        .delete(`/api/menu-items/${item.id}/image`)
        .set('Origin', env.APP_ORIGIN)
        .expect(403);

      // DELETE CSRF 錯誤
      await admin.agent
        .delete(`/api/menu-items/${item.id}/image`)
        .set('Origin', env.APP_ORIGIN)
        .set('X-CSRF-Token', 'invalid-token-here')
        .expect(403);
    });

    it('超過 2 MB 檔案回 413 PAYLOAD_TOO_LARGE', async () => {
      const item = await menu();
      const oversized = Buffer.alloc(MENU_IMAGE_MAX_BYTES + 1024, 0x00);
      JPEG_FIXTURE.copy(oversized, 0, 0, JPEG_FIXTURE.length);

      const res = await admin.agent
        .post(`/api/menu-items/${item.id}/image`)
        .set(headers(admin))
        .set('Content-Type', 'image/jpeg')
        .send(oversized)
        .expect(413);

      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('非允許之 Content-Type（例如 text/plain）回 415 UNSUPPORTED_MEDIA_TYPE', async () => {
      const item = await menu();
      const res = await admin.agent
        .post(`/api/menu-items/${item.id}/image`)
        .set(headers(admin))
        .set('Content-Type', 'text/plain')
        .send(Buffer.from('hello plain text'))
        .expect(415);

      expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    it('偽造 PNG 標頭但內容無效或非圖片回 422 INVALID_IMAGE_FILE', async () => {
      const item = await menu();
      // 宣稱 image/png 但傳文字
      const fakeText = Buffer.from('not an actual image file content');
      const resText = await admin.agent
        .post(`/api/menu-items/${item.id}/image`)
        .set(headers(admin))
        .set('Content-Type', 'image/png')
        .send(fakeText)
        .expect(422);
      expect(resText.body.error.code).toBe('INVALID_IMAGE_FILE');

      // 宣稱 image/png 但傳 JPEG 內容
      const resMismatch = await admin.agent
        .post(`/api/menu-items/${item.id}/image`)
        .set(headers(admin))
        .set('Content-Type', 'image/png')
        .send(JPEG_FIXTURE)
        .expect(422);
      expect(resMismatch.body.error.code).toBe('INVALID_IMAGE_FILE');
    });

    it('餐點不存在回 404 RESOURCE_NOT_FOUND 且不殘留磁碟檔案', async () => {
      const nonExistentId = randomUUID();
      const menuDir = path.join(tmpUploadRoot, 'menu-items');
      const filesBefore = fs.existsSync(menuDir) ? fs.readdirSync(menuDir) : [];

      const postRes = await admin.agent
        .post(`/api/menu-items/${nonExistentId}/image`)
        .set(headers(admin))
        .set('Content-Type', 'image/jpeg')
        .send(JPEG_FIXTURE)
        .expect(404);
      expect(postRes.body.error.code).toBe('RESOURCE_NOT_FOUND');

      const filesAfter = fs.existsSync(menuDir) ? fs.readdirSync(menuDir) : [];
      expect(filesAfter).toEqual(filesBefore);

      const deleteRes = await admin.agent
        .delete(`/api/menu-items/${nonExistentId}/image`)
        .set(headers(admin))
        .expect(404);
      expect(deleteRes.body.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('路徑穿越或非法檔名 GET /api/menu-items/images/:filename 回 404', async () => {
      const illegalFilenames = [
        '..%2F..%2Fetc%2Fpasswd',
        'evil.png',
        '12345.jpg',
        `${randomUUID()}.gif`,
        `${randomUUID()}.exe`,
        `${randomUUID()}.jpg`, // 合法 uuid 但檔案不存在
      ];

      for (const fn of illegalFilenames) {
        const res = await admin.agent.get(`/api/menu-items/images/${fn}`).expect(404);
        expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
      }
    });
  });

  describe('4. 檔案生命週期管理', () => {
    it('上傳第二張圖片取代第一張後，舊檔從暫存資料夾刪除，只保留新檔', async () => {
      const item = await menu();

      // 上傳第一張（JPEG）
      const firstRes = await admin.agent
        .post(`/api/menu-items/${item.id}/image`)
        .set(headers(admin))
        .set('Content-Type', 'image/jpeg')
        .send(JPEG_FIXTURE)
        .expect(200);

      const firstFn = parseLocalMenuImageFilename(firstRes.body.data.menuItem.imageUrl)!;
      const firstPath = path.join(tmpUploadRoot, 'menu-items', firstFn);
      expect(fs.existsSync(firstPath)).toBe(true);

      // 上傳第二張（PNG）取代
      const secondRes = await admin.agent
        .post(`/api/menu-items/${item.id}/image`)
        .set(headers(admin))
        .set('Content-Type', 'image/png')
        .send(PNG_FIXTURE)
        .expect(200);

      const secondFn = parseLocalMenuImageFilename(secondRes.body.data.menuItem.imageUrl)!;
      const secondPath = path.join(tmpUploadRoot, 'menu-items', secondFn);

      expect(fs.existsSync(firstPath)).toBe(false);
      expect(fs.existsSync(secondPath)).toBe(true);
      expect(secondFn).not.toBe(firstFn);
    });

    it('DELETE /api/menu-items/:id/image 將 imageUrl 設為 null 並刪除硬碟檔案', async () => {
      const item = await menu();

      const uploadRes = await admin.agent
        .post(`/api/menu-items/${item.id}/image`)
        .set(headers(admin))
        .set('Content-Type', 'image/png')
        .send(PNG_FIXTURE)
        .expect(200);

      const fn = parseLocalMenuImageFilename(uploadRes.body.data.menuItem.imageUrl)!;
      const filePath = path.join(tmpUploadRoot, 'menu-items', fn);
      expect(fs.existsSync(filePath)).toBe(true);

      const delRes = await admin.agent
        .delete(`/api/menu-items/${item.id}/image`)
        .set(headers(admin))
        .expect(200);

      expect(delRes.body.data.menuItem.imageUrl).toBeNull();
      expect(fs.existsSync(filePath)).toBe(false);

      // GET /api/menu-items/:id 確認資料庫中 imageUrl 亦為 null
      const getRes = await admin.agent.get(`/api/menu-items/${item.id}`).expect(200);
      expect(getRes.body.data.menuItem.imageUrl).toBeNull();
    });

    it('重新上傳後用 PATCH 修改 imageUrl 為外部 URL 或 null 亦刪除舊圖；僅改 name 則保留舊圖', async () => {
      const item = await menu();

      // 1. 上傳圖片並確認檔案存在
      const upload1 = await admin.agent
        .post(`/api/menu-items/${item.id}/image`)
        .set(headers(admin))
        .set('Content-Type', 'image/webp')
        .send(WEBP_FIXTURE)
        .expect(200);

      const fn1 = parseLocalMenuImageFilename(upload1.body.data.menuItem.imageUrl)!;
      const path1 = path.join(tmpUploadRoot, 'menu-items', fn1);
      expect(fs.existsSync(path1)).toBe(true);

      // 2. 僅改 name，舊圖檔應保留
      const patchNameRes = await admin.agent
        .patch(`/api/menu-items/${item.id}`)
        .set(headers(admin))
        .send({ name: `${prefix}-已改名餐點` })
        .expect(200);

      expect(patchNameRes.body.data.menuItem.name).toBe(`${prefix}-已改名餐點`);
      expect(patchNameRes.body.data.menuItem.imageUrl).toBe(upload1.body.data.menuItem.imageUrl);
      expect(fs.existsSync(path1)).toBe(true);

      // 3. PATCH 改為外部 URL，舊本機圖檔應被刪除
      const externalUrl = 'https://example.test/images/dish.jpg';
      const patchExternalRes = await admin.agent
        .patch(`/api/menu-items/${item.id}`)
        .set(headers(admin))
        .send({ imageUrl: externalUrl })
        .expect(200);

      expect(patchExternalRes.body.data.menuItem.imageUrl).toBe(externalUrl);
      expect(fs.existsSync(path1)).toBe(false);

      // 4. 重新上傳圖片，再 PATCH 改為 null，舊圖檔亦被刪除
      const upload2 = await admin.agent
        .post(`/api/menu-items/${item.id}/image`)
        .set(headers(admin))
        .set('Content-Type', 'image/jpeg')
        .send(JPEG_FIXTURE)
        .expect(200);

      const fn2 = parseLocalMenuImageFilename(upload2.body.data.menuItem.imageUrl)!;
      const path2 = path.join(tmpUploadRoot, 'menu-items', fn2);
      expect(fs.existsSync(path2)).toBe(true);

      const patchNullRes = await admin.agent
        .patch(`/api/menu-items/${item.id}`)
        .set(headers(admin))
        .send({ imageUrl: null })
        .expect(200);

      expect(patchNullRes.body.data.menuItem.imageUrl).toBeNull();
      expect(fs.existsSync(path2)).toBe(false);
    });
  });

  describe('5. OpenAPI 文件宣告包含餐點圖片端點', () => {
    it('GET /api/openapi.json 包含 /menu-items/{id}/image (post, delete) 與 /menu-items/images/{filename} (get)', async () => {
      const res = await request(app).get('/api/openapi.json').expect(200);
      const paths = res.body.paths;

      expect(paths['/menu-items/{id}/image']).toBeDefined();
      expect(paths['/menu-items/{id}/image'].post).toBeDefined();
      expect(paths['/menu-items/{id}/image'].delete).toBeDefined();

      expect(paths['/menu-items/images/{filename}']).toBeDefined();
      expect(paths['/menu-items/images/{filename}'].get).toBeDefined();

      // imageUrl 欄位移除 format: 'uri' 並允許站內相對路徑
      const menuItemSchema = res.body.components.schemas.MenuItem;
      expect(menuItemSchema.properties.imageUrl.format).toBeUndefined();
    });
  });

  describe('6. 驗證 work/uploads 未被測試污染', () => {
    it('測試全程在暫存目錄執行，work/uploads 絕不留殘留檔案', () => {
      const defaultRoot = path.resolve(process.cwd(), 'work/uploads');
      const testFilesLeaked = fs.existsSync(defaultRoot)
        ? fs.readdirSync(defaultRoot).filter((f) => f.startsWith('CB-') || f.startsWith('CIMG-'))
        : [];
      expect(testFilesLeaked).toHaveLength(0);
    });
  });
});
