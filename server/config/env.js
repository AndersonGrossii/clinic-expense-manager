import 'dotenv/config';

/**
 * Centralised, validated configuration. Fails fast when required secrets are missing.
 * Nothing sensitive is hardcoded here — values come from the environment (.env / Railway variables).
 */
function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function int(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid integer for ${name}`);
  return n;
}

const nodeEnv = process.env.NODE_ENV || 'development';

export const config = Object.freeze({
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: int('PORT', 3000),
  appOrigin: process.env.APP_ORIGIN || '',
  databaseUrl: required('DATABASE_URL'),
  pgSsl: String(process.env.PGSSL || 'false').toLowerCase() === 'true',
  storageDir: process.env.STORAGE_DIR || './storage',
  maxUploadBytes: int('MAX_UPLOAD_MB', 15) * 1024 * 1024,
  bcryptRounds: int('BCRYPT_ROUNDS', 12),
  sessionHours: int('SESSION_HOURS', 7),
  cookieName: 'ce_session',
  // Secure cookies by default in production; set COOKIE_SECURE=false only for plain-http local Docker.
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : nodeEnv === 'production',
  jwtIssuer: 'clinic-expense-manager',
  get jwtSecret() {
    const secret = required('JWT_SECRET');
    if (secret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
    return secret;
  },
});
