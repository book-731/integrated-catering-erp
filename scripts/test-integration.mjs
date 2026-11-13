import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

let fileEnv = {};
try {
  fileEnv = parseEnv(readFileSync(new URL('../.env', import.meta.url), 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const databaseUrl = process.env.TEST_DATABASE_URL ?? fileEnv.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('請先設定 TEST_DATABASE_URL，禁止回退使用開發資料庫。');
const url = new URL(databaseUrl);
if (
  !['postgres:', 'postgresql:'].includes(url.protocol) ||
  !url.pathname.slice(1).endsWith('_test')
) {
  throw new Error('整合測試資料庫名稱必須以 _test 結尾。');
}
const developmentUrl = process.env.DATABASE_URL ?? fileEnv.DATABASE_URL;
if (developmentUrl) {
  const development = new URL(developmentUrl);
  if (
    url.hostname === development.hostname &&
    (url.port || '5432') === (development.port || '5432') &&
    url.pathname === development.pathname
  ) {
    throw new Error('測試資料庫不可與開發資料庫相同。');
  }
}
const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  NODE_ENV: 'test',
  RUN_DB_INTEGRATION: '1',
};
const cwd = fileURLToPath(new URL('../apps/backend/', import.meta.url));
// 直接啟動 Node CLI，避免跨平台 shell 引號及 Windows npm.cmd 問題。
for (const [cli, args] of [
  ['prisma/build/index.js', ['migrate', 'deploy']],
  ['vitest/vitest.mjs', ['run', '--config', 'vitest.integration.config.ts']],
]) {
  const local = new URL(`../node_modules/${cli}`, import.meta.url);
  const result = spawnSync(process.execPath, [fileURLToPath(local), ...args], {
    cwd,
    env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
