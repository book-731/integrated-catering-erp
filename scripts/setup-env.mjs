import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const template = await readFile(new URL('.env.example', root), 'utf8');
try {
  await writeFile(
    new URL('.env', root),
    template.replaceAll('__LOCAL_DB_PASSWORD__', randomBytes(24).toString('hex')),
    { flag: 'wx', mode: 0o600 },
  );
  console.log('已建立 .env，使用隨機本機資料庫密碼。');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('.env 已存在，保留原有設定。');
}
