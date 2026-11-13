import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { authRepository } from '../src/modules/auth/auth.repository.js';
import { hashPassword } from '../src/modules/auth/password.js';
import {
  createUserSchema,
  validate,
  emailSchema,
  newPasswordSchema,
} from '../src/modules/auth/auth.validation.js';
import { ApiError } from '../src/common/api-error.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';

try {
  if (env.NODE_ENV === 'production') throw new Error('此工具僅供開發環境初始化管理員。');
  let email = process.env.DEV_ADMIN_EMAIL;
  let displayName = process.env.DEV_ADMIN_NAME ?? '第 12 組管理員';
  let password = process.env.DEV_ADMIN_PASSWORD;
  // 密碼不接受命令列參數，不輸出、不儲存到檔案。
  if (!email || !password) {
    if (!process.stdin.isTTY)
      throw new Error('請在互動終端執行，或由程序環境注入 DEV_ADMIN_EMAIL／DEV_ADMIN_PASSWORD。');
    let muted = false;
    const output = new Writable({
      write(chunk, _encoding, callback) {
        if (!muted) process.stdout.write(chunk);
        callback();
      },
    });
    const input = createInterface({ input: process.stdin, output, terminal: true });
    try {
      while (!email || !emailSchema.safeParse(email).success) {
        if (email)
          process.stdout.write('Email 格式不正確，請輸入完整 Email，例如 name@example.com。\n');
        email = (await input.question('管理員 Email：')).trim();
      }
      if (!password) {
        while (!password) {
          process.stdout.write('管理員密碼（12–128 字元，輸入不顯示）：');
          muted = true;
          const candidate = await input.question('');
          muted = false;
          process.stdout.write('\n');
          if (!newPasswordSchema.safeParse(candidate).success) {
            process.stdout.write('密碼長度須為 12–128 字元，請重新輸入。\n');
            continue;
          }
          process.stdout.write('再次輸入密碼（輸入不顯示）：');
          muted = true;
          const confirmation = await input.question('');
          muted = false;
          process.stdout.write('\n');
          if (candidate !== confirmation) {
            process.stdout.write('兩次密碼不同，請重新設定。\n');
            continue;
          }
          password = candidate;
        }
      }
    } finally {
      input.close();
    }
  }
  const data = validate(createUserSchema, {
    email,
    displayName,
    password,
    role: 'ADMIN',
    isActive: true,
  });
  const { password: secret, ...fields } = data;
  await authRepository.bootstrapAdmin({ ...fields, passwordHash: await hashPassword(secret) });
  console.log('已建立首位開發管理員。密碼未輸出；請使用剛才輸入的帳密登入。');
} catch (error) {
  const messages: Record<string, string> = {
    VALIDATION_ERROR: 'Email、名稱或密碼格式不符；密碼須為 12–128 字元。',
    ADMIN_EXISTS: '已有啟用管理員，未覆寫既有帳號。',
    EMAIL_CONFLICT: '此 Email 已被使用，請使用其他 Email。',
  };
  console.error(
    `管理員建立失敗：${error instanceof ApiError ? (messages[error.code] ?? '帳號狀態不允許此操作。') : '請檢查互動終端機、資料庫連線與環境設定。'}`,
  );
  process.exitCode = 1;
} finally {
  delete process.env.DEV_ADMIN_PASSWORD;
  await prisma.$disconnect();
}
