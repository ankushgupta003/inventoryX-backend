import { env } from './config/env';
import { createApp } from './app';
import { ensureSuperAdminSeeded } from './bootstrap/ensureSuperAdmin';

async function start() {
  const app = createApp();

  app.listen(env.PORT, () => {
    console.log(`InventoryX backend listening on port ${env.PORT}`);
  });

  // Don't block the HTTP listener on a cold database wake-up.
  ensureSuperAdminSeeded()
    .then(() => {
      console.log('Super admin bootstrap check completed');
    })
    .catch((error) => {
      console.error('Super admin bootstrap check failed', error);
    });
}

start().catch((error) => {
  console.error('Failed to start InventoryX backend', error);
  process.exit(1);
});
