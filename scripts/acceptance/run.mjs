import { writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { format } from 'prettier';
import {
  root,
  apiUrl,
  origin,
  startDatabase,
  deploy,
  startServices,
  stopServices,
  stopDatabase,
  ready,
} from './environment.mjs';
import { scenario } from './scenario.mjs';
import { ApiClient } from './client.mjs';
import { settings } from './environment.mjs';
import { accountEmail } from './scenario.mjs';
import { developmentFingerprint, demoFingerprint, sourceAudit, evidence } from './audit.mjs';
export async function runAcceptance() {
  const developmentBefore = await developmentFingerprint();
  await startDatabase();
  deploy();
  let healthy = false;
  try {
    healthy = (await fetch(apiUrl + '/health', { signal: AbortSignal.timeout(1000) })).ok;
  } catch {}
  if (!healthy) startServices();
  await ready();
  const results = await scenario();
  const live = new ApiClient();
  await live.login(accountEmail('MANAGER'), settings().accountPassword);
  const before = await demoFingerprint();
  await stopServices();
  await stopDatabase();
  let unavailable = false;
  try {
    await fetch(apiUrl + '/health', { signal: AbortSignal.timeout(1000) });
  } catch {
    unavailable = true;
  }
  await startDatabase();
  startServices();
  await ready();
  const sessionRestored = (await live.request('/auth/me')).data.user.role === 'MANAGER';
  await live.logout();
  const after = await demoFingerprint();
  // lastSeenAt and login limit counters legitimately change when a browser reconnects.
  // Compare every business/account/migration table, and test a real session separately.
  const stable = (data) =>
    Object.fromEntries(
      Object.entries(data).filter(([name]) => !['sessions', 'auth_rate_limits'].includes(name)),
    );
  const persistence = {
    name: '22 隔離API與PostgreSQL重啟後營運資料及帳號保留、Session延續',
    passed:
      unavailable &&
      sessionRestored &&
      JSON.stringify(stable(before)) === JSON.stringify(stable(after)),
    tables: Object.keys(stable(before)).length,
    sessionRestored,
    volatileTablesChanged: Object.keys(before).filter(
      (name) =>
        ['sessions', 'auth_rate_limits'].includes(name) &&
        JSON.stringify(before[name]) !== JSON.stringify(after[name]),
    ),
  };
  const developmentAfter = await developmentFingerprint(),
    preserved = JSON.stringify(developmentBefore) === JSON.stringify(developmentAfter);
  const security = sourceAudit();
  const report = {
    version: '0.4.0',
    checkedAt: new Date().toISOString(),
    database: { host: '127.0.0.1', port: 55434, name: 'restaurant_erp_acceptance_test' },
    frontend: origin,
    api: apiUrl,
    scenario: results,
    persistence,
    developmentDataAndAccountsUnchanged: preserved,
    sourceAndSecurityPassed: security.passed,
    passed: results.passed && persistence.passed && preserved && security.passed,
    total: results.total + 1,
    success: results.success + Number(persistence.passed),
  };
  writeFileSync(
    resolve(evidence, 'acceptance.json'),
    await format(JSON.stringify(report), { parser: 'json', printWidth: 100 }),
  );
  if (!report.passed)
    throw Error('Acceptance verification failed; retained evidence and databases for inspection.');
  console.log(
    `驗收 ${report.success}/${report.total} 通過；重啟保存通過，開發帳號與業務資料未變。`,
  );
  return report;
}
try {
  await runAcceptance();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
