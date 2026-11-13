import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  openSync,
  closeSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const directory = resolve(root, 'work/acceptance-demo');
export const dbDirectory = resolve(directory, 'postgres');
export const privateFile = resolve(directory, 'private.json');
export const apiUrl = 'http://127.0.0.1:3004/api';
export const origin = 'http://localhost:5175';
const marker = resolve(directory, 'OWNER.json');
export function settings() {
  mkdirSync(directory, { recursive: true });
  if (!existsSync(marker)) {
    if (existsSync(resolve(dbDirectory, 'PG_VERSION')))
      throw Error('Unowned demo cluster; no changes made.');
    writeFileSync(
      marker,
      JSON.stringify({ purpose: 'team12-isolated-acceptance', workspace: root }),
      { flag: 'wx' },
    );
  }
  const owner = JSON.parse(readFileSync(marker, 'utf8'));
  if (
    owner.workspace !== root ||
    owner.purpose !== 'team12-isolated-acceptance' ||
    !dbDirectory.startsWith(resolve(root, 'work') + '\\')
  )
    throw Error('Demo directory identity mismatch.');
  if (!existsSync(privateFile))
    writeFileSync(
      privateFile,
      JSON.stringify({
        databasePassword: randomBytes(32).toString('base64url'),
        accountPassword: randomBytes(32).toString('base64url'),
        user: 'acceptance_owner',
        database: 'restaurant_erp_acceptance_test',
        port: 55434,
      }),
      { flag: 'wx', mode: 0o600 },
    );
  const config = JSON.parse(readFileSync(privateFile, 'utf8'));
  if (
    config.port !== 55434 ||
    config.database !== 'restaurant_erp_acceptance_test' ||
    config.user !== 'acceptance_owner'
  )
    throw Error('Only dedicated demo database is allowed.');
  return config;
}
export function connection(database) {
  const c = settings(),
    url = new URL(`postgresql://${c.user}@127.0.0.1:${c.port}/${database ?? c.database}`);
  url.password = c.databasePassword;
  // Prisma adapter-pg currently drops timestamptz offsets on non-UTC sessions.
  // Scope the workaround to these dedicated demo connections, never ALTER DATABASE.
  url.searchParams.set('options', '-c TimeZone=UTC');
  return url.href;
}
export function environment() {
  return {
    ...process.env,
    DATABASE_URL: connection(),
    NODE_ENV: 'development',
    API_HOST: '127.0.0.1',
    API_PORT: '3004',
    APP_ORIGIN: origin,
    CORS_ORIGIN: origin,
    SESSION_COOKIE_SECURE: 'false',
    TRUST_PROXY_HOPS: '0',
    SESSION_IDLE_MINUTES: '30',
    SESSION_MAX_HOURS: '8',
    LOGIN_RATE_LIMIT_IP: '30',
    LOGIN_RATE_LIMIT_ACCOUNT: '10',
    VITE_API_BASE_URL: '/api',
    VITE_API_PROXY_TARGET: 'http://127.0.0.1:3004',
  };
}
async function binaries() {
  if (process.platform !== 'win32') throw Error('This isolated demo helper targets Windows.');
  return import(
    new URL(
      '../../work/postgres-runtime/node_modules/@embedded-postgres/windows-x64/dist/index.js',
      import.meta.url,
    ).href
  );
}
async function running() {
  const { pg_ctl } = await binaries();
  return (
    spawnSync(pg_ctl, ['status', '-D', dbDirectory], { windowsHide: true, stdio: 'ignore' })
      .status === 0
  );
}
export async function startDatabase() {
  const c = settings(),
    { initdb, pg_ctl } = await binaries();
  if (!existsSync(resolve(dbDirectory, 'PG_VERSION'))) {
    const probe = new Client({
      host: '127.0.0.1',
      port: c.port,
      user: c.user,
      connectionTimeoutMillis: 1000,
    });
    let occupied = false;
    try {
      await probe.connect();
      occupied = true;
    } catch (e) {
      if (e.code !== 'ECONNREFUSED') occupied = true;
    } finally {
      await probe.end();
    }
    if (occupied) throw Error('Demo port occupied; no database reset or replacement attempted.');
    const passwordFile = resolve(directory, 'init-password.tmp');
    writeFileSync(passwordFile, c.databasePassword, { flag: 'wx', mode: 0o600 });
    try {
      const r = spawnSync(
        initdb,
        [
          '-D',
          dbDirectory,
          '-U',
          c.user,
          '-A',
          'scram-sha-256',
          '--pwfile',
          passwordFile,
          '--encoding=UTF8',
          '--locale=C',
        ],
        { windowsHide: true, stdio: 'ignore' },
      );
      if (r.status !== 0) throw Error('Dedicated initdb failed.');
    } finally {
      unlinkSync(passwordFile);
    }
  }
  if (!(await running())) {
    const r = spawnSync(
      pg_ctl,
      [
        'start',
        '-D',
        dbDirectory,
        '-l',
        resolve(directory, 'postgres.log'),
        '-o',
        `-h 127.0.0.1 -p ${c.port}`,
        '-w',
        '-t',
        '20',
      ],
      { windowsHide: true, stdio: 'ignore' },
    );
    if (r.status !== 0) throw Error('Dedicated PostgreSQL start failed.');
  }
  const db = new Client({
    connectionString: connection('postgres'),
    connectionTimeoutMillis: 3000,
  });
  await db.connect();
  try {
    if (!(await db.query('SELECT 1 FROM pg_database WHERE datname=$1', [c.database])).rowCount)
      await db.query('CREATE DATABASE restaurant_erp_acceptance_test');
  } finally {
    await db.end();
  }
}
export async function stopDatabase() {
  settings();
  if (await running()) {
    const { pg_ctl } = await binaries();
    const r = spawnSync(pg_ctl, ['stop', '-D', dbDirectory, '-m', 'fast', '-w', '-t', '20'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    if (r.status !== 0) throw Error('Dedicated PostgreSQL stop failed.');
  }
}
export function deploy() {
  const r = spawnSync(
    process.execPath,
    [resolve(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    { cwd: resolve(root, 'apps/backend'), env: environment(), encoding: 'utf8', windowsHide: true },
  );
  if (r.status !== 0) throw Error('Demo migration deploy failed; no reset attempted.');
}
const processesFile = resolve(directory, 'processes.json');
function ownedProcess(kind, pid, stop = false) {
  if (!Number.isInteger(pid)) throw Error('Invalid demo PID');
  const workspace = root.replaceAll('\\', '/').replaceAll("'", "''");
  const check = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `$ErrorActionPreference='Stop';$p=Get-CimInstance Win32_Process -Filter "ProcessId=${pid}";if(!$p){exit 4};$line=$p.CommandLine.Replace([char]92,[char]47);if($p.Name -ne 'node.exe' -or $line -notlike '*${workspace}*' -or $line -notmatch '${kind === 'api' ? 'apps/backend/src/server.ts' : 'vite.js'}'){exit 3};${stop ? `Stop-Process -Id ${pid}` : ''}`,
    ],
    { windowsHide: true, stdio: 'ignore' },
  );
  if (check.status === 4) return false;
  if (check.status !== 0) throw Error('Could not verify owned demo process.');
  return true;
}
export function startServices() {
  if (existsSync(processesFile)) {
    const p = JSON.parse(readFileSync(processesFile, 'utf8'));
    if (p.workspace !== root) throw Error('Service ownership mismatch.');
    const apiRunning = ownedProcess('api', p.api);
    const webRunning = ownedProcess('web', p.web);
    if (apiRunning && webRunning) return;
    if (apiRunning || webRunning)
      throw Error('Partial demo services; use demo:restart to recover owned processes.');
  }
  const launch = (args, cwd, log) => {
    const fd = openSync(resolve(directory, log), 'a');
    try {
      const p = spawn(process.execPath, args, {
        cwd,
        env: environment(),
        detached: true,
        windowsHide: true,
        stdio: ['ignore', fd, fd],
      });
      p.unref();
      return p.pid;
    } finally {
      closeSync(fd);
    }
  };
  const api = launch(
    ['--import', 'tsx', resolve(root, 'apps/backend/src/server.ts')],
    root,
    'api.log',
  );
  const web = launch(
    [
      resolve(root, 'node_modules/vite/bin/vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      '5175',
      '--strictPort',
    ],
    resolve(root, 'apps/frontend'),
    'web.log',
  );
  writeFileSync(processesFile, JSON.stringify({ api, web, workspace: root }));
}
export async function stopServices() {
  if (!existsSync(processesFile)) return;
  const p = JSON.parse(readFileSync(processesFile, 'utf8'));
  if (p.workspace !== root) throw Error('Service ownership mismatch.');
  // Check the exact process command before signalling; never trust an old, reused PID.
  for (const [kind, pid] of [
    ['api', p.api],
    ['web', p.web],
  ]) {
    ownedProcess(kind, pid, true);
  }
  unlinkSync(processesFile);
}
export async function ready() {
  for (let i = 0; i < 40; i++) {
    try {
      const [api, web, proxy] = await Promise.all([
        fetch(apiUrl + '/health', { signal: AbortSignal.timeout(1000) }),
        fetch(origin + '/login', { signal: AbortSignal.timeout(1000) }),
        fetch(origin + '/api/health', { signal: AbortSignal.timeout(1000) }),
      ]);
      if (
        api.ok &&
        web.ok &&
        proxy.ok &&
        (await api.json()).data?.database?.status === 'up' &&
        (await proxy.json()).data?.database?.status === 'up'
      )
        return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw Error('Demo API, frontend or API proxy did not become healthy.');
}
export async function withDatabase(fn) {
  const db = new Client({ connectionString: connection(), connectionTimeoutMillis: 3000 });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}
export async function cli(action) {
  if (action === 'start') {
    await startDatabase();
    deploy();
    startServices();
    await ready();
    console.log('隔離展示已啟動：PostgreSQL 55434、API 3004、前端 localhost:5175。');
  } else if (action === 'stop') {
    await stopServices();
    await stopDatabase();
    console.log('已停止隔離展示服務，所有展示資料保留；開發／一般測試服務未操作。');
  } else if (action === 'restart') {
    await stopServices();
    await stopDatabase();
    await startDatabase();
    startServices();
    await ready();
    console.log('隔離展示環境已重啟，資料保留。');
  } else throw Error('Use start, stop or restart.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await cli(process.argv[2]);
  } catch {
    console.error('隔離環境操作失敗；沒有重設、清空或取代資料庫。');
    process.exitCode = 1;
  }
}
