import { env } from './config/env';
import { createApp } from './app';
import { ensureSuperAdminSeeded } from './bootstrap/ensureSuperAdmin';

async function start() {
  await ensureSuperAdminSeeded();
  const app = createApp();

  app.listen(env.PORT, () => {
    console.log(`InventoryX backend listening on port ${env.PORT}`);
  });
}

start().catch((error) => {
  console.error('Failed to start InventoryX backend', error);
  process.exit(1);
});
