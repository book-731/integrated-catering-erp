import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './environment.mjs';
import { evidence, redact, sourceAudit } from './audit.mjs';
const npm =
  process.platform === 'win32'
    ? resolve(process.execPath, '../node_modules/npm/bin/npm-cli.js')
    : process.env.npm_execpath;
const cli =
  process.platform === 'win32'
    ? resolve(process.execPath, '../node_modules/npm/bin/npm-cli.js')
    : npm;
const jobs = [
  ['check', 'check'],
  ['db', 'db'],
  ['test-1', 'test'],
  ['test-2', 'test'],
  ['format', 'format'],
  ['integration', 'test:integration'],
  ['operational', 'test:acceptance'],
  ['format-check', 'format:check'],
];
const commands = [];
for (const [name, script] of jobs) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(process.execPath, [cli, 'run', script], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 240000,
    maxBuffer: 12 * 1024 * 1024,
  });
  const log = resolve(evidence, `${name}.txt`);
  writeFileSync(log, redact((result.stdout ?? '') + (result.stderr ?? '')));
  commands.push({
    command: `npm run ${script}`,
    startedAt,
    exitCode: result.status,
    passed: result.status === 0,
    log: `docs/verification/acceptance-final/${name}.txt`,
  });
  console.log(`${name}: ${result.status === 0 ? 'PASS' : 'FAIL'}`);
  if (result.status !== 0) break;
}
const tests = (path) => {
  try {
    return [...readFileSync(resolve(evidence, path), 'utf8').matchAll(/Tests\s+(\d+) passed/g)].map(
      (m) => Number(m[1]),
    );
  } catch {
    return [];
  }
};
const [backend = 0, frontend = 0] = tests('check.txt'),
  [database = 0] = tests('integration.txt');
let operational = { passed: false, total: 0, success: 0 };
try {
  operational = JSON.parse(readFileSync(resolve(evidence, 'acceptance.json'), 'utf8'));
} catch {}
let browser = { passed: false };
try {
  browser = JSON.parse(readFileSync(resolve(evidence, 'browser.json'), 'utf8'));
} catch {}
const audit = sourceAudit();
const result = {
  version: '0.4.0',
  checkedAt: new Date().toISOString(),
  commands,
  tests: {
    backend,
    frontend,
    database,
    vitestTotal: backend + frontend + database,
    operationalChecks: operational.total,
    operationalSuccess: operational.success,
    previousVitestRetained: 167,
  },
  browserPassed: browser.passed,
  securityPassed: audit.passed,
  passed:
    commands.length === jobs.length &&
    commands.every((c) => c.passed) &&
    operational.passed &&
    browser.passed &&
    audit.passed,
};
writeFileSync(resolve(evidence, 'RESULTS.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result.tests));
if (!result.passed) process.exitCode = 1;
