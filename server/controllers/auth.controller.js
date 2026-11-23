import bcrypt from 'bcrypt';
import { query } from '../../database/db.js';
import { config } from '../config/env.js';
import { signSession, sessionCookieOptions } from '../middlewares/auth.middleware.js';
import { parse, loginSchema } from '../validators/index.js';
import { unauthorized } from '../utils/errors.js';

// Dummy hash so the response time is similar whether or not the email exists.
const DUMMY_HASH = bcrypt.hashSync('timing-safe-dummy-password', 10);

export async function login(req, res) {
  const { email, password } = parse(loginSchema, req.body);
  const { rows } = await query('SELECT id, email, full_name, password_hash FROM users WHERE LOWER(email) = $1', [email]);
  const user = rows[0];
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) throw unauthorized('Email o contraseña incorrectos');

  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
  res.cookie(config.cookieName, signSession(user), sessionCookieOptions());
  res.json({
    user: { id: user.id, email: user.email, full_name: user.full_name },
    expiresInHours: config.sessionHours,
  });
}

export function logout(req, res) {
  const { maxAge, ...opts } = sessionCookieOptions();
  res.clearCookie(config.cookieName, opts);
  res.json({ ok: true });
}

export function me(req, res) {
  res.json({ user: req.user });
}
