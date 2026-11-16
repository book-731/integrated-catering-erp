import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/common/api-error.js';
import { env } from '../src/config/env.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { protectCsrfFor } from '../src/modules/auth/auth.middleware.js';
import type { Actor } from '../src/modules/auth/auth.types.js';
import { catalogController } from '../src/modules/catalog/catalog.controller.js';
import type { CatalogRepository } from '../src/modules/catalog/catalog.repository.js';
import { CatalogService } from '../src/modules/catalog/catalog.service.js';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MenuImageStorage,
} from '../src/modules/catalog/menu-image-storage.js';
import { createApp } from '../src/app.js';

const PNG_FIXTURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const JPEG_FIXTURE = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

const adminActor: Actor = { id: '11111111-1111-4111-8111-111111111111', authVersion: 0 };

function createFakeMenuItem(id: string, name = '牛肉麵', imageUrl: string | null = null) {
  return {
    id,
    name,
    categoryId: '22222222-2222-4222-8222-222222222222',
    price: new Prisma.Decimal('180.00'),
    imageUrl,
    isActive: true,
    isAvailable: true,
    recipeVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    category: {
      id: '22222222-2222-4222-8222-222222222222',
      name: '主食',
      isActive: true,
    },
    _count: { recipes: 2 },
  };
}

describe('protectCsrfFor CSRF 與 Content-Type 守衛', () => {
  const csrfToken = 'test-valid-csrf-token-string';

  function createTestApp() {
    const app = express();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.authContext = {
        session: {
          id: 'test-session-id',
          userId: 'test-user-id',
          csrfToken,
          authVersion: 0,
          createdAt: new Date(),
          lastSeenAt: new Date(),
          expiresAt: new Date(Date.now() + 60000),
        },
        user: {
          id: 'test-user-id',
          email: 'admin@example.test',
          displayName: 'Admin',
          passwordHash: 'dummy-hash',
          role: 'ADMIN',
          isActive: true,
          authVersion: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };
      next();
    });

    app.post('/json-only', protectCsrfFor(['application/json']), (_req: Request, res: Response) => {
      res.json({ ok: true });
    });

    app.delete('/no-content-type', protectCsrfFor(), (_req: Request, res: Response) => {
      res.json({ ok: true });
    });

    app.post(
      '/images-only',
      protectCsrfFor(ALLOWED_IMAGE_MIME_TYPES),
      (_req: Request, res: Response) => {
        res.json({ ok: true });
      },
    );

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || 500;
      res.status(status).json({
        success: false,
        error: { code: err.code || 'INTERNAL_ERROR', message: err.message },
      });
    });

    return app;
  }

  it("protectCsrfFor(['application/json']) 拒絕 text/plain（415）", async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/json-only')
      .set('Origin', env.APP_ORIGIN)
      .set('X-CSRF-Token', csrfToken)
      .set('Content-Type', 'text/plain')
      .send('hello');

    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('protectCsrfFor() 允許無 Content-Type 的 DELETE', async () => {
    const app = createTestApp();
    const res = await request(app)
      .delete('/no-content-type')
      .set('Origin', env.APP_ORIGIN)
      .set('X-CSRF-Token', csrfToken);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('protectCsrfFor() 在無效 CSRF token 時仍回 403', async () => {
    const app = createTestApp();
    const res = await request(app)
      .delete('/no-content-type')
      .set('Origin', env.APP_ORIGIN)
      .set('X-CSRF-Token', 'wrong-csrf-token');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_INVALID');
  });

  it('protectCsrfFor(ALLOWED_IMAGE_MIME_TYPES) 接受帶參數的 image/png; charset=binary', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/images-only')
      .set('Origin', env.APP_ORIGIN)
      .set('X-CSRF-Token', csrfToken)
      .set('Content-Type', 'image/png; charset=binary')
      .send(PNG_FIXTURE);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('CatalogService 圖片生命週期與交易回滾', () => {
  let tmpUploadRoot: string;
  let imageStorage: MenuImageStorage;

  beforeEach(() => {
    tmpUploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-service-img-test-'));
    imageStorage = new MenuImageStorage(tmpUploadRoot);
  });

  afterAll(() => {
    if (tmpUploadRoot && fs.existsSync(tmpUploadRoot)) {
      fs.rmSync(tmpUploadRoot, { recursive: true, force: true });
    }
  });

  function countFilesInMenuDir(): number {
    const dir = path.join(tmpUploadRoot, 'menu-items');
    if (!fs.existsSync(dir)) return 0;
    return fs.readdirSync(dir).length;
  }

  it('uploadMenuImage: 目標餐點不存在（404）時，不會在磁碟寫入檔案', async () => {
    const fakeRepo = {
      menuItem: vi.fn(async () => {
        throw new ApiError(404, 'RESOURCE_NOT_FOUND', '找不到餐點。');
      }),
      setMenuImage: vi.fn(),
    } as unknown as CatalogRepository;

    const service = new CatalogService(fakeRepo, imageStorage);

    await expect(
      service.uploadMenuImage(
        adminActor,
        '33333333-3333-4333-8333-333333333333',
        'image/png',
        PNG_FIXTURE,
      ),
    ).rejects.toThrow('找不到餐點。');

    expect(countFilesInMenuDir()).toBe(0);
    expect(fakeRepo.setMenuImage).not.toHaveBeenCalled();
  });

  it('uploadMenuImage: 資料庫寫入失敗時，剛存入暫存資料夾的新圖檔會被立即刪除（磁碟無殘留）', async () => {
    const targetItem = createFakeMenuItem('33333333-3333-4333-8333-333333333333');
    const fakeRepo = {
      menuItem: vi.fn(async () => targetItem),
      setMenuImage: vi.fn(async () => {
        throw new Error('Database transaction failed unexpectedly');
      }),
    } as unknown as CatalogRepository;

    const service = new CatalogService(fakeRepo, imageStorage);

    await expect(
      service.uploadMenuImage(
        adminActor,
        '33333333-3333-4333-8333-333333333333',
        'image/png',
        PNG_FIXTURE,
      ),
    ).rejects.toThrow('Database transaction failed unexpectedly');

    expect(countFilesInMenuDir()).toBe(0);
  });

  it('uploadMenuImage: 替換原本有本機圖片的餐點時，舊圖檔會被刪除、新圖檔保留', async () => {
    // 預先存入舊圖
    const oldSaved = await imageStorage.save('image/jpeg', JPEG_FIXTURE);
    expect(countFilesInMenuDir()).toBe(1);

    const oldItem = createFakeMenuItem(
      '33333333-3333-4333-8333-333333333333',
      '牛肉麵',
      oldSaved.imageUrl,
    );

    const fakeRepo = {
      menuItem: vi.fn(async () => oldItem),
      setMenuImage: vi.fn(async (_actor, _id, newImageUrl) => {
        const updated = { ...oldItem, imageUrl: newImageUrl };
        return { item: updated, previousImageUrl: oldSaved.imageUrl };
      }),
    } as unknown as CatalogRepository;

    const service = new CatalogService(fakeRepo, imageStorage);

    const result = await service.uploadMenuImage(
      adminActor,
      '33333333-3333-4333-8333-333333333333',
      'image/png',
      PNG_FIXTURE,
    );

    expect(result.imageUrl).toMatch(/^\/api\/menu-items\/images\/[0-9a-f-]+\.png$/);
    expect(countFilesInMenuDir()).toBe(1);

    // 舊圖讀取應為 404
    await expect(imageStorage.read(oldSaved.filename)).rejects.toThrow(ApiError);
  });

  it('uploadMenuImage: 替換原本是外部 https://... 的餐點時，不會誤刪也不報錯', async () => {
    const oldExternalUrl = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c';
    const oldItem = createFakeMenuItem(
      '33333333-3333-4333-8333-333333333333',
      '牛肉麵',
      oldExternalUrl,
    );

    const fakeRepo = {
      menuItem: vi.fn(async () => oldItem),
      setMenuImage: vi.fn(async (_actor, _id, newImageUrl) => {
        const updated = { ...oldItem, imageUrl: newImageUrl };
        return { item: updated, previousImageUrl: oldExternalUrl };
      }),
    } as unknown as CatalogRepository;

    const service = new CatalogService(fakeRepo, imageStorage);

    const result = await service.uploadMenuImage(
      adminActor,
      '33333333-3333-4333-8333-333333333333',
      'image/png',
      PNG_FIXTURE,
    );

    expect(result.imageUrl).toMatch(/^\/api\/menu-items\/images\/[0-9a-f-]+\.png$/);
    expect(countFilesInMenuDir()).toBe(1);
  });

  it('updateMenu: 僅改 name（未傳 imageUrl）時不刪除既有本機圖檔', async () => {
    const saved = await imageStorage.save('image/png', PNG_FIXTURE);
    expect(countFilesInMenuDir()).toBe(1);

    const currentItem = createFakeMenuItem(
      '33333333-3333-4333-8333-333333333333',
      '牛肉麵',
      saved.imageUrl,
    );

    const fakeRepo = {
      updateMenu: vi.fn(async () => {
        const updated = { ...currentItem, name: '招牌牛肉麵' };
        return { item: updated, previousImageUrl: saved.imageUrl };
      }),
    } as unknown as CatalogRepository;

    const service = new CatalogService(fakeRepo, imageStorage);

    const result = await service.updateMenu(adminActor, '33333333-3333-4333-8333-333333333333', {
      name: '招牌牛肉麵',
    });

    expect(result.name).toBe('招牌牛肉麵');
    expect(result.imageUrl).toBe(saved.imageUrl);
    expect(countFilesInMenuDir()).toBe(1);
  });

  it('updateMenu: imageUrl 改為 null 時刪除舊本機圖檔', async () => {
    const saved = await imageStorage.save('image/png', PNG_FIXTURE);
    expect(countFilesInMenuDir()).toBe(1);

    const currentItem = createFakeMenuItem(
      '33333333-3333-4333-8333-333333333333',
      '牛肉麵',
      saved.imageUrl,
    );

    const fakeRepo = {
      updateMenu: vi.fn(async () => {
        const updated = { ...currentItem, imageUrl: null };
        return { item: updated, previousImageUrl: saved.imageUrl };
      }),
    } as unknown as CatalogRepository;

    const service = new CatalogService(fakeRepo, imageStorage);

    const result = await service.updateMenu(adminActor, '33333333-3333-4333-8333-333333333333', {
      imageUrl: null,
    });

    expect(result.imageUrl).toBeNull();
    expect(countFilesInMenuDir()).toBe(0);
  });

  it('updateMenu: imageUrl 改為外部 URL 時刪除舊本機圖檔', async () => {
    const saved = await imageStorage.save('image/png', PNG_FIXTURE);
    expect(countFilesInMenuDir()).toBe(1);

    const currentItem = createFakeMenuItem(
      '33333333-3333-4333-8333-333333333333',
      '牛肉麵',
      saved.imageUrl,
    );
    const newExternalUrl = 'https://images.unsplash.com/photo-test';

    const fakeRepo = {
      updateMenu: vi.fn(async () => {
        const updated = { ...currentItem, imageUrl: newExternalUrl };
        return { item: updated, previousImageUrl: saved.imageUrl };
      }),
    } as unknown as CatalogRepository;

    const service = new CatalogService(fakeRepo, imageStorage);

    const result = await service.updateMenu(adminActor, '33333333-3333-4333-8333-333333333333', {
      imageUrl: newExternalUrl,
    });

    expect(result.imageUrl).toBe(newExternalUrl);
    expect(countFilesInMenuDir()).toBe(0);
  });

  it('deleteMenuImage: 呼叫 setMenuImage(actor, id, null) 並清除本機舊檔', async () => {
    const saved = await imageStorage.save('image/png', PNG_FIXTURE);
    expect(countFilesInMenuDir()).toBe(1);

    const currentItem = createFakeMenuItem(
      '33333333-3333-4333-8333-333333333333',
      '牛肉麵',
      saved.imageUrl,
    );

    const fakeRepo = {
      setMenuImage: vi.fn(async () => {
        const updated = { ...currentItem, imageUrl: null };
        return { item: updated, previousImageUrl: saved.imageUrl };
      }),
    } as unknown as CatalogRepository;

    const service = new CatalogService(fakeRepo, imageStorage);

    const result = await service.deleteMenuImage(
      adminActor,
      '33333333-3333-4333-8333-333333333333',
    );

    expect(result.imageUrl).toBeNull();
    expect(countFilesInMenuDir()).toBe(0);
    expect(fakeRepo.setMenuImage).toHaveBeenCalledWith(
      adminActor,
      '33333333-3333-4333-8333-333333333333',
      null,
    );
  });

  it('readMenuImage: 委派 imageStorage.read(filename)', async () => {
    const saved = await imageStorage.save('image/png', PNG_FIXTURE);
    const fakeRepo = {} as CatalogRepository;
    const service = new CatalogService(fakeRepo, imageStorage);

    const read = await service.readMenuImage(saved.filename);
    expect(read.mimeType).toBe('image/png');
    expect(read.buffer.equals(PNG_FIXTURE)).toBe(true);
  });
});

describe('catalogController 與路由整合契約', () => {
  it('controller.uploadMenuImage 若 Buffer.isBuffer(request.body) 為 false 時回傳 415 UNSUPPORTED_MEDIA_TYPE', async () => {
    const controller = catalogController({} as any);
    const req = {
      body: 'not-a-buffer',
      params: { id: '33333333-3333-4333-8333-333333333333' },
    } as unknown as Request;
    const res = {} as Response;

    await expect(controller.uploadMenuImage(req, res, () => {})).rejects.toMatchObject({
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: '僅支援 JPG、PNG 或 WebP 圖片檔案。',
    });
  });

  it('controller.menuImage 正確設定 Content-Type、inline、nosniff 與 Cache-Control private immutable', async () => {
    const mockService = {
      readMenuImage: vi.fn(async (_filename: string) => ({
        buffer: PNG_FIXTURE,
        mimeType: 'image/png' as const,
      })),
    } as unknown as CatalogService;

    const controller = catalogController(mockService);
    const headers: Record<string, string> = {};
    const req = {
      params: { filename: '12345678-1234-4234-8234-123456789012.png' },
    } as unknown as Request;
    let sentBuffer: Buffer | null = null;
    const res = {
      setHeader: vi.fn((k: string, v: string) => {
        headers[k.toLowerCase()] = v;
      }),
      send: vi.fn((buf: Buffer) => {
        sentBuffer = buf;
      }),
    } as unknown as Response;

    await controller.menuImage(req, res, () => {});

    expect(headers['content-type']).toBe('image/png');
    expect(headers['content-disposition']).toBe('inline');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['cache-control']).toBe('private, max-age=31536000, immutable');
    expect(sentBuffer).toEqual(PNG_FIXTURE);
  });

  it('createApp 接受 menuImageStorage 選填參數', () => {
    const tmpUploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'create-app-test-'));
    try {
      const storage = new MenuImageStorage(tmpUploadRoot);
      const app = createApp({ menuImageStorage: storage });
      expect(app).toBeDefined();
    } finally {
      fs.rmSync(tmpUploadRoot, { recursive: true, force: true });
    }
  });
});
