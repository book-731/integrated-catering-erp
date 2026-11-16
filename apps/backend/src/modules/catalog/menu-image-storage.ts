import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiError } from '../../common/api-error.js';

export const MENU_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const MENU_IMAGE_URL_PREFIX = '/api/menu-items/images/';
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];
export type DetectedMenuImage = { mimeType: AllowedImageMimeType; ext: 'jpg' | 'png' | 'webp' };

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const RIFF_SIGNATURE = Buffer.from([0x52, 0x49, 0x46, 0x46]);
const WEBP_SIGNATURE = Buffer.from([0x57, 0x45, 0x42, 0x50]);

const VALID_FILENAME_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|png|webp)$/;

const LOCAL_IMAGE_URL_PATTERN =
  /^\/api\/menu-items\/images\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp))$/;

const EXT_TO_MIME: Record<'jpg' | 'png' | 'webp', AllowedImageMimeType> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return typeof err === 'object' && err !== null && 'code' in err;
}

export function normalizeMediaType(contentType: string | undefined): string | undefined {
  if (!contentType) {
    return undefined;
  }
  const rawType = contentType.split(';')[0]?.trim().toLowerCase();
  return rawType || undefined;
}

function detectBufferImageFormat(buffer: Buffer): DetectedMenuImage | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: 'image/jpeg', ext: 'jpg' };
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { mimeType: 'image/png', ext: 'png' };
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).equals(RIFF_SIGNATURE) &&
    buffer.subarray(8, 12).equals(WEBP_SIGNATURE)
  ) {
    return { mimeType: 'image/webp', ext: 'webp' };
  }
  return null;
}

export function detectMenuImageFormat(
  contentType: string | undefined,
  buffer: Buffer,
): DetectedMenuImage {
  const normalizedMime = normalizeMediaType(contentType);
  if (
    !normalizedMime ||
    !ALLOWED_IMAGE_MIME_TYPES.includes(normalizedMime as AllowedImageMimeType)
  ) {
    throw new ApiError(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      '僅支援 image/jpeg、image/png 或 image/webp 圖片格式。',
    );
  }

  if (!buffer || buffer.length === 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', '請提供有效的圖片檔案內容。');
  }

  const detected = detectBufferImageFormat(buffer);
  if (!detected || detected.mimeType !== normalizedMime) {
    throw new ApiError(422, 'INVALID_IMAGE_FILE', '僅支援有效的 JPG、PNG 或 WebP 圖片檔案。');
  }

  return detected;
}

export function parseLocalMenuImageFilename(imageUrl: string | null | undefined): string | null {
  if (!imageUrl || typeof imageUrl !== 'string') {
    return null;
  }
  const match = LOCAL_IMAGE_URL_PATTERN.exec(imageUrl);
  return match ? (match[1] ?? null) : null;
}

export function validateMenuImageFilename(filename: string): {
  filename: string;
  mimeType: AllowedImageMimeType;
} {
  const match = VALID_FILENAME_PATTERN.exec(filename);
  if (!match) {
    throw new ApiError(404, 'RESOURCE_NOT_FOUND', '找不到餐點圖片。');
  }
  const ext = match[2] as 'jpg' | 'png' | 'webp';
  const mimeType = EXT_TO_MIME[ext];
  return { filename, mimeType };
}

export function defaultUploadRoot(): string {
  return fileURLToPath(new URL('../../../../../work/uploads', import.meta.url));
}

export class MenuImageStorage {
  private readonly menuDir: string;

  constructor(uploadRoot: string = process.env.UPLOAD_DIR?.trim() || defaultUploadRoot()) {
    this.menuDir = path.resolve(uploadRoot, 'menu-items');
  }

  async save(
    contentType: string | undefined,
    buffer: Buffer,
  ): Promise<{ filename: string; imageUrl: string; mimeType: AllowedImageMimeType }> {
    const { mimeType, ext } = detectMenuImageFormat(contentType, buffer);
    const filename = `${randomUUID()}.${ext}`;
    const filePath = path.resolve(this.menuDir, filename);

    await fs.mkdir(this.menuDir, { recursive: true });
    await fs.writeFile(filePath, buffer);

    const imageUrl = `${MENU_IMAGE_URL_PREFIX}${filename}`;
    return { filename, imageUrl, mimeType };
  }

  async read(filename: string): Promise<{ buffer: Buffer; mimeType: AllowedImageMimeType }> {
    const { mimeType } = validateMenuImageFilename(filename);
    const filePath = path.resolve(this.menuDir, filename);
    const expectedPrefix = this.menuDir.endsWith(path.sep)
      ? this.menuDir
      : `${this.menuDir}${path.sep}`;

    if (!filePath.startsWith(expectedPrefix)) {
      throw new ApiError(404, 'RESOURCE_NOT_FOUND', '找不到餐點圖片。');
    }

    try {
      const buffer = await fs.readFile(filePath);
      return { buffer, mimeType };
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        throw new ApiError(404, 'RESOURCE_NOT_FOUND', '找不到餐點圖片。');
      }
      throw err;
    }
  }

  async deleteFilename(filename: string): Promise<void> {
    validateMenuImageFilename(filename);
    const filePath = path.resolve(this.menuDir, filename);
    const expectedPrefix = this.menuDir.endsWith(path.sep)
      ? this.menuDir
      : `${this.menuDir}${path.sep}`;

    if (!filePath.startsWith(expectedPrefix)) {
      throw new ApiError(404, 'RESOURCE_NOT_FOUND', '找不到餐點圖片。');
    }

    try {
      await fs.unlink(filePath);
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        return;
      }
      throw err;
    }
  }

  async deleteByImageUrlQuietly(imageUrl: string | null | undefined): Promise<void> {
    const filename = parseLocalMenuImageFilename(imageUrl);
    if (!filename) {
      return;
    }
    try {
      await this.deleteFilename(filename);
    } catch {
      console.warn(JSON.stringify({ level: 'warn', code: 'MENU_IMAGE_CLEANUP_FAILED' }));
    }
  }
}
