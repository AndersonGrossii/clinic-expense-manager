import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { query } from '../../database/db.js';
import { unauthorized } from '../utils/errors.js';

export function signSession(user) {
  return jwt.sign({ sub: user.id }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: `${config.sessionHours}h`,
    issuer: config.jwtIssuer,
  });
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict',
    path: '/',
    maxAge: config.sessionHours * 60 * 60 * 1000,
  };
}

/** Requires a valid JWT in the httpOnly session cookie; attaches req.user. */
export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[config.cookieName];
    if (!token) throw unauthorized();
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], issuer: config.jwtIssuer });
    } catch {
      throw unauthorized('Sesión caducada o no válida');
    }
    const { rows } = await query('SELECT id, email, full_name FROM users WHERE id = $1', [payload.sub]);
    if (!rows[0]) throw unauthorized();
    req.user = rows[0];
    next();
  } catch (err) {
    if (err.status === 401) res.clearCookie(config.cookieName, { path: '/' });
    next(err);
  }
}
