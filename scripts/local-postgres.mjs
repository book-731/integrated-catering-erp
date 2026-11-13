// Windows 環境 Docker 引擎無法啟動時的可選工具；正式路徑仍為 Docker Compose。
// 僅操作本專案 work/local-postgres-*，不註冊服務、不修改現有資料庫。
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

if (process.platform !== 'win32')
  throw new Error('此備援工具僅供 Windows 使用，Linux 請使用 Docker Compose。');
const root = new URL('../', import.meta.url);
const nativeModule = new URL(
  'work/postgres-runtime/node_modules/@embedded-postgres/windows-x64/dist/index.js',
  root,
);
if (!existsSync(nativeModule)) throw new Error('請先執行 README 的原生 PostgreSQL 備援安裝指令。');
const { initdb, pg_ctl } = await import(nativeModule.href);
const env = { ...parseEnv(readFileSync(new URL('.env', root), 'utf8')), ...process.env };
const command = process.argv[2] ?? 'status';
if (!['start', 'stop', 'status'].includes(command)) throw new Error('僅支援 start、stop、status。');

for (const [suffix, connection] of [
  ['dev', env.DATABASE_URL],
  ['test', env.TEST_DATABASE_URL],
]) {
  const url = new URL(connection);
  if (
    url.hostname !== '127.0.0.1' ||
    !['55432', '55433'].includes(url.port) ||
    !['restaurant_erp', 'restaurant_erp_test'].includes(url.pathname.slice(1))
  ) {
    throw new Error('備援工具僅接受 README 預設的本機隔離位址與資料庫名稱。');
  }
  const directory = fileURLToPath(new URL(`work/local-postgres-${suffix}/`, root));
  const log = fileURLToPath(new URL(`work/local-postgres-${suffix}.log`, root));
  const run = (binary, args, required = true) => {
    const result = spawnSync(binary, args, {
      encoding: 'utf8',
      windowsHide: true,
      ...(args[0] === 'start' ? { stdio: 'ignore' } : {}),
    });
    if (result.error) throw result.error;
    if (required && result.status !== 0)
      throw new Error(`PostgreSQL ${suffix} 指令失敗：${result.stderr || result.stdout}`);
    return result;
  };
  const running =
    existsSync(directory) && run(pg_ctl, ['status', '-D', directory], false).status === 0;
  if (command === 'status') {
    console.log(`PostgreSQL ${suffix}: ${running ? 'running' : 'stopped'} (port ${url.port})`);
    continue;
  }
  if (command === 'stop') {
    if (running) run(pg_ctl, ['stop', '-D', directory, '-m', 'fast', '-w', '-t', '20']);
    console.log(`PostgreSQL ${suffix}: stopped; data preserved.`);
    continue;
  }
  if (running) console.log(`PostgreSQL ${suffix}: already running.`);
  if (!existsSync(new URL(`work/local-postgres-${suffix}/PG_VERSION`, root))) {
    mkdirSync(directory, { recursive: true });
    const passwordFile = fileURLToPath(new URL(`work/.postgres-${suffix}-password`, root));
    let createdPasswordFile = false;
    try {
      writeFileSync(passwordFile, decodeURIComponent(url.password), { flag: 'wx', mode: 0o600 });
      createdPasswordFile = true;
      run(initdb, [
        '-D',
        directory,
        '-U',
        decodeURIComponent(url.username),
        '-A',
        'scram-sha-256',
        '--pwfile',
        passwordFile,
        '--encoding=UTF8',
        '--locale=C',
      ]);
    } finally {
      if (createdPasswordFile && existsSync(passwordFile)) unlinkSync(passwordFile);
    }
  }
  if (!running)
    run(pg_ctl, [
      'start',
      '-D',
      directory,
      '-l',
      log,
      '-o',
      `-h 127.0.0.1 -p ${url.port}`,
      '-w',
      '-t',
      '20',
    ]);
  const client = new Client({
    connectionString: new URL('/postgres', url).href,
    connectionTimeoutMillis: 3000,
  });
  try {
    await client.connect();
    const database = url.pathname.slice(1);
    const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
    if (found.rowCount === 0)
      await client.query(
        database === 'restaurant_erp'
          ? 'CREATE DATABASE restaurant_erp'
          : 'CREATE DATABASE restaurant_erp_test',
      );
    const version = await client.query('SHOW server_version');
    console.log(
      `PostgreSQL ${suffix}: ${version.rows[0].server_version}, ready on 127.0.0.1:${url.port}.`,
    );
  } finally {
    await client.end();
  }
}
