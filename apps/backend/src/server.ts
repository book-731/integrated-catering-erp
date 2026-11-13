import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';

const server = createApp().listen(env.API_PORT, env.API_HOST, () => {
  console.log(`ERP API listening on http://${env.API_HOST}:${env.API_PORT}`);
});
server.on('error', () => {
  console.error('API 啟動失敗，請檢查位址與連接埠。');
  process.exit(1);
});
let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  const deadline = setTimeout(() => {
    server.closeAllConnections();
    process.exit(1);
  }, 10000);
  deadline.unref();
  server.close(() => {
    void prisma.$disconnect().then(
      () => {
        clearTimeout(deadline);
        process.exit(0);
      },
      () => process.exit(1),
    );
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
