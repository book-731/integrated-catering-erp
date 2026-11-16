import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

config({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), quiet: true });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z
    .url()
    .refine((value) => /^postgres(ql)?:\/\//.test(value), '需使用 PostgreSQL 連線 URL'),
  CORS_ORIGIN: z.url().default('http://localhost:5173'),
  APP_ORIGIN: z.url().default('http://127.0.0.1:5173'),
  SESSION_COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(1).default(0),
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(240).default(30),
  SESSION_MAX_HOURS: z.coerce.number().int().min(1).max(24).default(8),
  LOGIN_RATE_LIMIT_IP: z.coerce.number().int().min(1).max(1000).default(30),
  LOGIN_RATE_LIMIT_ACCOUNT: z.coerce.number().int().min(1).max(1000).default(10),
  UPLOAD_DIR: z.string().trim().min(1).optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // 僅輸出欄位名稱，避免將連線字串中的密碼寫入日誌。
  throw new Error(
    `環境變數設定錯誤：${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}。請檢查根目錄 .env。`,
  );
}
const cookieSecure =
  parsed.data.SESSION_COOKIE_SECURE === undefined
    ? parsed.data.NODE_ENV === 'production'
    : parsed.data.SESSION_COOKIE_SECURE === 'true';
const origin = new URL(parsed.data.APP_ORIGIN);
if (origin.origin !== parsed.data.APP_ORIGIN || !['http:', 'https:'].includes(origin.protocol)) {
  throw new Error('APP_ORIGIN 必須是完整 origin，不可包含路徑或結尾斜線。');
}
if (!cookieSecure && !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) {
  throw new Error('非本機環境必須使用 Secure Cookie。');
}
if (
  cookieSecure &&
  origin.protocol !== 'https:' &&
  !['localhost', '127.0.0.1'].includes(origin.hostname)
) {
  throw new Error('Secure Cookie 的 APP_ORIGIN 必須使用 HTTPS。');
}
export const env = { ...parsed.data, SESSION_COOKIE_SECURE: cookieSecure };
export const trustedOrigins = new Set(
  env.NODE_ENV === 'production' ? [env.APP_ORIGIN] : [env.APP_ORIGIN, env.CORS_ORIGIN],
);
