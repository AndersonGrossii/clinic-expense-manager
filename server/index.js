import fs from 'node:fs/promises';
import { config } from './config/env.js';
import { STORAGE_ROOT } from './config/storage.js';
import { pool } from '../database/db.js';
import { createApp } from './app.js';

async function start() {
  void config.jwtSecret; // fail fast if missing / too short
  await fs.mkdir(STORAGE_ROOT, { recursive: true });
  await pool.query('SELECT 1');

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`[server] Clinic Expense Manager listening on port ${config.port} (${config.nodeEnv})`);
  });

  const shutdown = (signal) => {
    console.log(`[server] ${signal} received, shutting down…`);
    server.close(async () => {
      await pool.end().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('[server] failed to start:', err.message);
  process.exit(1);
});
