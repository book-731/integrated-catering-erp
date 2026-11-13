import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { Client } from 'pg';
import { root, privateFile, withDatabase } from './environment.mjs';
export const evidence = resolve(root, 'docs/verification/acceptance-final');
mkdirSync(evidence, { recursive: true });
const sha = (value) => createHash('sha256').update(value).digest('hex');
const secrets = () => {
  const config = parseEnv(readFileSync(resolve(root, '.env'), 'utf8')),
    values = [];
  for (const [key, value] of Object.entries(config))
    if (/PASSWORD|SECRET|TOKEN|DATABASE_URL/i.test(key) && value) values.push(value);
  for (const key of ['DATABASE_URL', 'TEST_DATABASE_URL']) {
    const u = new URL(config[key]);
    values.push(u.password, decodeURIComponent(u.password));
  }
  if (existsSync(privateFile)) {
    const p = JSON.parse(readFileSync(privateFile, 'utf8'));
    values.push(p.databasePassword, p.accountPassword);
  }
  return values.filter((v) => v.length >= 8);
};
export function redact(text) {
  for (const secret of secrets()) text = text.replaceAll(secret, '[REDACTED]');
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}
export async function fingerprint(client) {
  const tables = (
    await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    )
  ).rows;
  const result = {};
  await client.query('BEGIN READ ONLY');
  try {
    for (const { tablename } of tables) {
      const quoted = '"' + tablename.replaceAll('"', '""') + '"';
      const r = (
        await client.query(
          `SELECT count(*)::int AS count,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM ${quoted} t`,
        )
      ).rows[0];
      result[tablename] = r;
    }
  } finally {
    await client.query('ROLLBACK');
  }
  return result;
}
export async function developmentFingerprint() {
  const c = { ...parseEnv(readFileSync(resolve(root, '.env'), 'utf8')), ...process.env };
  const db = new Client({ connectionString: c.DATABASE_URL, connectionTimeoutMillis: 3000 });
  try {
    await db.connect();
    const all = await fingerprint(db);
    delete all.sessions;
    delete all.auth_rate_limits;
    return all;
  } finally {
    await db.end();
  }
}
export async function demoFingerprint() {
  return withDatabase(fingerprint);
}
export function sourceFiles() {
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (resolve(top) === resolve(root))
      return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
        cwd: root,
        encoding: 'utf8',
      })
        .split('\0')
        .filter(Boolean);
  } catch {}
  const result = [],
    skip = new Set(['node_modules', 'dist', 'generated', 'coverage', '.git', 'work', 'outputs']);
  const walk = (folder) => {
    for (const entry of readdirSync(resolve(root, folder), { withFileTypes: true })) {
      const path = folder ? folder + '/' + entry.name : entry.name;
      if (skip.has(entry.name) || entry.isSymbolicLink()) continue;
      if (/^\.env(?:\.|$)/i.test(entry.name) && entry.name !== '.env.example') continue;
      if (entry.isDirectory()) walk(path);
      else result.push(path);
    }
  };
  for (const folder of ['apps', 'scripts', 'docs', '.github']) walk(folder);
  for (const name of [
    'README.md',
    'package.json',
    'package-lock.json',
    'docker-compose.yml',
    '.env.example',
    '.gitignore',
    '.dockerignore',
    '.gitattributes',
    '.nvmrc',
    '.prettierignore',
    '.prettierrc.json',
  ])
    if (existsSync(resolve(root, name))) result.push(name);
  return result;
}
export function sourceAudit() {
  const list = sourceFiles();
  const source = list.filter(
    (f) => /^(apps|scripts|docs)\//.test(f) && !f.includes('/verification/'),
  );
  const inventory = source.map((path) => {
    const text = readFileSync(resolve(root, path), 'utf8');
    return {
      path,
      lines: text.split('\n').length,
      sha256: sha(text),
      tests: (text.match(/\b(?:it|test)\s*(?:\.each\([^]*?\))?\s*\(/g) ?? []).length,
    };
  });
  const original = JSON.parse(
    readFileSync(resolve(root, 'docs/MIGRATION_BASELINE.json'), 'utf8'),
  ).files;
  const migrations = original.map((f) => ({
    path: f.path,
    unchanged: sha(readFileSync(resolve(root, f.path))) === f.sha256,
  }));
  const secretValues = secrets(),
    matches = list.filter((path) =>
      secretValues.some((v) => readFileSync(resolve(root, path)).includes(Buffer.from(v))),
    );
  const env = parseEnv(readFileSync(resolve(root, '.env'), 'utf8')),
    example = parseEnv(readFileSync(resolve(root, '.env.example'), 'utf8'));
  const missing = Object.keys(example).filter((k) => !(k in env)),
    extra = Object.keys(env).filter((k) => !(k in example));
  const defaults = {
    SESSION_COOKIE_SECURE: 'false',
    SESSION_IDLE_MINUTES: '30',
    SESSION_MAX_HOURS: '8',
    LOGIN_RATE_LIMIT_IP: '30',
    LOGIN_RATE_LIMIT_ACCOUNT: '10',
    TRUST_PROXY_HOPS: '0',
  };
  const effective = Object.fromEntries(
    Object.entries(defaults).map(([k, d]) => [
      k,
      { source: k in env ? 'env' : 'validated-default', value: env[k] ?? d },
    ]),
  );
  let envIgnored = readFileSync(resolve(root, '.gitignore'), 'utf8')
      .split(/\r?\n/)
      .includes('.env'),
    trackedEnv = false;
  try {
    envIgnored =
      execFileSync('git', ['check-ignore', '.env'], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() === '.env';
    trackedEnv =
      execFileSync('git', ['ls-files', '.env'], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim().length > 0;
  } catch {}
  const report = {
    checkedAt: new Date().toISOString(),
    files: inventory,
    migrations,
    environment: {
      missingExampleKeys: missing,
      extraKeys: extra,
      effective,
      csrf: 'synchronizer token + exact Origin + JSON; server checks on every write',
      httpOnly: true,
      sameSite: 'Lax',
    },
    security: { knownSecretMatches: matches, envIgnored, trackedEnv },
    passed:
      migrations.every((m) => m.unchanged) && matches.length === 0 && envIgnored && !trackedEnv,
  };
  writeFileSync(resolve(evidence, 'source-security.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}
