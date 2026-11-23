import bcrypt from 'bcrypt';
import { pool, withTransaction } from '../database/db.js';
import { config } from '../server/config/env.js';
import { createClinic } from '../server/services/clinic.service.js';

/**
 * Creates the initial user from environment variables (never hardcoded):
 *   SEED_USER_EMAIL, SEED_USER_PASSWORD, SEED_USER_NAME, SEED_CLINIC_NAME (optional)
 * Idempotent: if the user already exists nothing is changed (password is NOT overwritten
 * unless SEED_USER_RESET_PASSWORD=true).
 */
async function main() {
  const email = (process.env.SEED_USER_EMAIL || '').trim().toLowerCase();
  const password = process.env.SEED_USER_PASSWORD || '';
  const fullName = (process.env.SEED_USER_NAME || 'Owner').trim();
  const clinicName = (process.env.SEED_CLINIC_NAME || '').trim();
  const resetPassword = String(process.env.SEED_USER_RESET_PASSWORD || 'false') === 'true';

  if (!email || !password) {
    console.log('[seed] SEED_USER_EMAIL / SEED_USER_PASSWORD not set — skipping user creation');
    return;
  }
  if (password.length < 8) throw new Error('SEED_USER_PASSWORD must be at least 8 characters');

  await withTransaction(async (c) => {
    const existing = await c.query('SELECT id FROM users WHERE LOWER(email) = $1', [email]);
    let userId = existing.rows[0]?.id;
    if (!userId) {
      const hash = await bcrypt.hash(password, config.bcryptRounds);
      const ins = await c.query(
        'INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id',
        [email, hash, fullName],
      );
      userId = ins.rows[0].id;
      console.log(`[seed] user created: ${email}`);
    } else if (resetPassword) {
      const hash = await bcrypt.hash(password, config.bcryptRounds);
      await c.query('UPDATE users SET password_hash = $2 WHERE id = $1', [userId, hash]);
      console.log(`[seed] password reset for: ${email}`);
    } else {
      console.log(`[seed] user already exists: ${email}`);
    }

    const clinics = await c.query('SELECT COUNT(*)::int AS n FROM clinics WHERE owner_user_id = $1', [userId]);
    if (clinics.rows[0].n === 0 && clinicName) {
      await createClinic(userId, { name: clinicName }, c);
      console.log(`[seed] first clinic created: ${clinicName}`);
    }
  });
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('[seed]', err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
