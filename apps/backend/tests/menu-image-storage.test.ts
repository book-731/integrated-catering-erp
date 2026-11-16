import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ApiError } from '../src/common/api-error.js';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  defaultUploadRoot,
  detectMenuImageFormat,
  MENU_IMAGE_MAX_BYTES,
  MENU_IMAGE_URL_PREFIX,
  MenuImageStorage,
  normalizeMediaType,
  parseLocalMenuImageFilename,
  validateMenuImageFilename,
} from '../src/modules/catalog/menu-image-storage.js';

const JPEG_FIXTURE = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG_FIXTURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const WEBP_FIXTURE = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38,
]);

describe('menu-image-storage constants & media type normalization', () => {
  it('匯出符合規格的常數', () => {
    expect(MENU_IMAGE_MAX_BYTES).toBe(2 * 1024 * 1024);
    expect(MENU_IMAGE_URL_PREFIX).toBe('/api/menu-items/images/');
    expect(ALLOWED_IMAGE_MIME_TYPES).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  });

  it('normalizeMediaType: 正確解析 media type 並剝除參數與空白', () => {
    expect(normalizeMediaType('image/jpeg')).toBe('image/jpeg');
    expect(normalizeMediaType('IMAGE/PNG')).toBe('image/png');
    expect(normalizeMediaType('image/jpeg; charset=binary')).toBe('image/jpeg');
    expect(normalizeMediaType('  image/webp ; boundary=something  ')).toBe('image/webp');
    expect(normalizeMediaType(undefined)).toBeUndefined();
    expect(normalizeMediaType('')).toBeUndefined();
    expect(normalizeMediaType('   ')).toBeUndefined();
  });

  it('defaultUploadRoot: 定位專案根目錄下的 work/uploads', () => {
    const root = defaultUploadRoot();
    expect(path.isAbsolute(root)).toBe(true);
    const normalized = root.replace(/\\/g, '/');
    expect(normalized.endsWith('/work/uploads')).toBe(true);
  });
});

describe('detectMenuImageFormat', () => {
  it('接受並正確辨識 JPEG、PNG 與 WebP 魔術位元組', () => {
    expect(detectMenuImageFormat('image/jpeg', JPEG_FIXTURE)).toEqual({
      mimeType: 'image/jpeg',
      ext: 'jpg',
    });
    expect(detectMenuImageFormat('image/png', PNG_FIXTURE)).toEqual({
      mimeType: 'image/png',
      ext: 'png',
    });
    expect(detectMenuImageFormat('image/webp', WEBP_FIXTURE)).toEqual({
      mimeType: 'image/webp',
      ext: 'webp',
    });
  });

  it('接受帶有參數的 Content-Type（例如 charset=binary）', () => {
    expect(detectMenuImageFormat('image/jpeg; charset=binary', JPEG_FIXTURE)).toEqual({
      mimeType: 'image/jpeg',
      ext: 'jpg',
    });
    expect(detectMenuImageFormat('IMAGE/PNG; foo=bar', PNG_FIXTURE)).toEqual({
      mimeType: 'image/png',
      ext: 'png',
    });
  });

  it('非允許 MIME 拋出 415 UNSUPPORTED_MEDIA_TYPE', () => {
    expect(() => detectMenuImageFormat(undefined, JPEG_FIXTURE)).toThrow(ApiError);
    try {
      detectMenuImageFormat('text/plain', JPEG_FIXTURE);
      expect.unreachable('應拋出錯誤');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(415);
      expect(apiErr.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    }

    try {
      detectMenuImageFormat('image/gif', JPEG_FIXTURE);
      expect.unreachable('應拋出錯誤');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(415);
      expect(apiErr.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    }
  });

  it('空 Buffer 拋出 400 VALIDATION_ERROR', () => {
    try {
      detectMenuImageFormat('image/jpeg', Buffer.alloc(0));
      expect.unreachable('應拋出錯誤');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(400);
      expect(apiErr.code).toBe('VALIDATION_ERROR');
      expect(apiErr.message).toBe('請提供有效的圖片檔案內容。');
    }
  });

  it('魔術位元組不符合或與宣告 MIME 不一致時拋出 422 INVALID_IMAGE_FILE', () => {
    // 宣告 image/png 但傳入 JPEG 內容
    try {
      detectMenuImageFormat('image/png', JPEG_FIXTURE);
      expect.unreachable('應拋出錯誤');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(422);
      expect(apiErr.code).toBe('INVALID_IMAGE_FILE');
      expect(apiErr.message).toBe('僅支援有效的 JPG、PNG 或 WebP 圖片檔案。');
    }

    // 宣告 image/jpeg 但傳入純文字
    try {
      detectMenuImageFormat('image/jpeg', Buffer.from('not an image'));
      expect.unreachable('應拋出錯誤');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(422);
      expect(apiErr.code).toBe('INVALID_IMAGE_FILE');
      expect(apiErr.message).toBe('僅支援有效的 JPG、PNG 或 WebP 圖片檔案。');
    }

    // 宣告 image/jpeg 但傳入 GIF 檔案
    try {
      detectMenuImageFormat('image/jpeg', Buffer.from('GIF89a123456'));
      expect.unreachable('應拋出錯誤');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(422);
      expect(apiErr.code).toBe('INVALID_IMAGE_FILE');
      expect(apiErr.message).toBe('僅支援有效的 JPG、PNG 或 WebP 圖片檔案。');
    }

    // 宣告 image/jpeg 但長度不足
    try {
      detectMenuImageFormat('image/jpeg', Buffer.from([0xff, 0xd8]));
      expect.unreachable('應拋出錯誤');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(422);
      expect(apiErr.code).toBe('INVALID_IMAGE_FILE');
    }
  });
});

describe('validateMenuImageFilename 與 parseLocalMenuImageFilename', () => {
  const validUuid = '12345678-1234-4234-8234-123456789abc';

  it('validateMenuImageFilename: 接受標準小寫 UUID 檔名並回傳對應 MIME', () => {
    expect(validateMenuImageFilename(`${validUuid}.jpg`)).toEqual({
      filename: `${validUuid}.jpg`,
      mimeType: 'image/jpeg',
    });
    expect(validateMenuImageFilename(`${validUuid}.png`)).toEqual({
      filename: `${validUuid}.png`,
      mimeType: 'image/png',
    });
    expect(validateMenuImageFilename(`${validUuid}.webp`)).toEqual({
      filename: `${validUuid}.webp`,
      mimeType: 'image/webp',
    });
  });

  it('validateMenuImageFilename: 拒絕路徑穿越、大寫 UUID、未知副檔名與畸形檔名', () => {
    const invalidCases = [
      '../x.jpg',
      '..\\x.jpg',
      `../../${validUuid}.jpg`,
      `${validUuid.toUpperCase()}.jpg`,
      `${validUuid}.svg`,
      `${validUuid}.gif`,
      `${validUuid}.jpeg`,
      'test.jpg',
      '',
    ];

    for (const filename of invalidCases) {
      expect(() => validateMenuImageFilename(filename)).toThrow(ApiError);
      try {
        validateMenuImageFilename(filename);
      } catch (err) {
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(404);
        expect(apiErr.code).toBe('RESOURCE_NOT_FOUND');
        expect(apiErr.message).toBe('找不到餐點圖片。');
      }
    }
  });

  it('parseLocalMenuImageFilename: 正確解析站內小寫 UUID 圖片檔名', () => {
    expect(parseLocalMenuImageFilename(`/api/menu-items/images/${validUuid}.jpg`)).toBe(
      `${validUuid}.jpg`,
    );
    expect(parseLocalMenuImageFilename(`/api/menu-items/images/${validUuid}.png`)).toBe(
      `${validUuid}.png`,
    );
    expect(parseLocalMenuImageFilename(`/api/menu-items/images/${validUuid}.webp`)).toBe(
      `${validUuid}.webp`,
    );
  });

  it('parseLocalMenuImageFilename: 拒絕外部網址、路徑穿越、大寫 UUID 與非站內路徑', () => {
    expect(parseLocalMenuImageFilename('https://example.com/images/meal.jpg')).toBeNull();
    expect(
      parseLocalMenuImageFilename('http://127.0.0.1:3000/api/menu-items/images/meal.jpg'),
    ).toBeNull();
    expect(parseLocalMenuImageFilename(`/api/menu-items/images/../${validUuid}.jpg`)).toBeNull();
    expect(
      parseLocalMenuImageFilename(`/api/menu-items/images/${validUuid.toUpperCase()}.jpg`),
    ).toBeNull();
    expect(parseLocalMenuImageFilename(`/api/menu-items/images/${validUuid}.svg`)).toBeNull();
    expect(
      parseLocalMenuImageFilename(`/api/menu-items/images/${validUuid}.jpg?param=1`),
    ).toBeNull();
    expect(parseLocalMenuImageFilename(null)).toBeNull();
    expect(parseLocalMenuImageFilename(undefined)).toBeNull();
    expect(parseLocalMenuImageFilename('')).toBeNull();
  });
});

describe('MenuImageStorage', () => {
  const tmpUploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-img-test-'));
  const storage = new MenuImageStorage(tmpUploadRoot);

  afterAll(() => {
    fs.rmSync(tmpUploadRoot, { recursive: true, force: true });
  });

  it('save 與 read: 寫入圖片後可成功讀回相同的 Buffer 與 MIME', () => {
    return (async () => {
      const saved = await storage.save('image/png', PNG_FIXTURE);
      expect(saved.filename).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/,
      );
      expect(saved.imageUrl).toBe(`/api/menu-items/images/${saved.filename}`);
      expect(saved.mimeType).toBe('image/png');

      const diskPath = path.join(tmpUploadRoot, 'menu-items', saved.filename);
      expect(fs.existsSync(diskPath)).toBe(true);

      const readResult = await storage.read(saved.filename);
      expect(readResult.mimeType).toBe('image/png');
      expect(readResult.buffer.equals(PNG_FIXTURE)).toBe(true);
    })();
  });

  it('read: 找不到檔案時拋出 404 RESOURCE_NOT_FOUND', async () => {
    const nonExistent = '00000000-0000-4000-8000-000000000000.jpg';
    await expect(storage.read(nonExistent)).rejects.toMatchObject({
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: '找不到餐點圖片。',
    });
  });

  it('read: 嘗試路徑穿越檔名直接在驗證時拋出 404', async () => {
    await expect(storage.read('../hack.jpg')).rejects.toMatchObject({
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: '找不到餐點圖片。',
    });
  });

  it('deleteFilename: 成功刪除檔案，且重複刪除不存在檔案不拋錯', async () => {
    const saved = await storage.save('image/jpeg', JPEG_FIXTURE);
    const diskPath = path.join(tmpUploadRoot, 'menu-items', saved.filename);
    expect(fs.existsSync(diskPath)).toBe(true);

    await storage.deleteFilename(saved.filename);
    expect(fs.existsSync(diskPath)).toBe(false);

    // 再次刪除已不存在的檔案不拋錯
    await expect(storage.deleteFilename(saved.filename)).resolves.toBeUndefined();

    // 刪除後讀取拋 404
    await expect(storage.read(saved.filename)).rejects.toMatchObject({
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
    });
  });

  it('deleteByImageUrlQuietly: 成功清理站內圖片，且對外部或無效網址安靜返回', async () => {
    const saved = await storage.save('image/webp', WEBP_FIXTURE);
    const diskPath = path.join(tmpUploadRoot, 'menu-items', saved.filename);
    expect(fs.existsSync(diskPath)).toBe(true);

    // 站內 URL 刪除
    await expect(storage.deleteByImageUrlQuietly(saved.imageUrl)).resolves.toBeUndefined();
    expect(fs.existsSync(diskPath)).toBe(false);

    // 重複以站內 URL 刪除（檔案已不存在）
    await expect(storage.deleteByImageUrlQuietly(saved.imageUrl)).resolves.toBeUndefined();

    // 外部 URL、null、undefined
    await expect(
      storage.deleteByImageUrlQuietly('https://images.unsplash.com/photo-1'),
    ).resolves.toBeUndefined();
    await expect(storage.deleteByImageUrlQuietly(null)).resolves.toBeUndefined();
    await expect(storage.deleteByImageUrlQuietly(undefined)).resolves.toBeUndefined();
  });
});
