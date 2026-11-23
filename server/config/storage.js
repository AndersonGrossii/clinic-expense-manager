import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './env.js';

/**
 * Local, clinic-partitioned storage. All paths stored in DB are RELATIVE to STORAGE_DIR,
 * e.g. "clinic_<uuid>/2026/11/<random>.pdf". Swappable for an S3/R2 adapter with the same API.
 */
export const STORAGE_ROOT = path.resolve(config.storageDir);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function clinicDir(clinicId) {
  if (!UUID_RE.test(clinicId)) throw new Error('Invalid clinic id for storage');
  return path.join(STORAGE_ROOT, `clinic_${clinicId.toLowerCase()}`);
}

/** Build a new relative path for an upload inside the clinic folder. */
export function newRelativePath(clinicId, ext) {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const name = `${crypto.randomUUID()}.${ext}`;
  return path.posix.join(`clinic_${clinicId.toLowerCase()}`, yyyy, mm, name);
}

/** Resolve a stored relative path to an absolute path, refusing traversal outside the clinic folder. */
export function resolveStored(clinicId, relativePath) {
  const base = clinicDir(clinicId);
  const abs = path.resolve(STORAGE_ROOT, relativePath);
  if (!abs.startsWith(base + path.sep)) throw new Error('Path outside clinic storage');
  return abs;
}

export async function ensureDirFor(absPath) {
  await fs.mkdir(path.dirname(absPath), { recursive: true });
}

export async function removeStored(clinicId, relativePath) {
  if (!relativePath) return;
  try {
    await fs.unlink(resolveStored(clinicId, relativePath));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('[storage] could not delete file:', err.message);
  }
}

export async function removeAbsolute(absPath) {
  if (!absPath) return;
  try { await fs.unlink(absPath); } catch (err) {
    if (err.code !== 'ENOENT') console.error('[storage] could not delete temp file:', err.message);
  }
}
