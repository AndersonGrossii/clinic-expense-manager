import { query } from '../../database/db.js';
import { badRequest, notFound } from '../utils/errors.js';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Clinic isolation guard. Reads the active clinic from the `X-Clinic-Id` header and verifies
 * that the authenticated user owns it. Sets `req.clinicId` — the ONLY value services may use
 * to scope queries. A clinic that is not owned by the user is reported as 404 (no info leak).
 */
export async function requireClinic(req, res, next) {
  try {
    const clinicId = req.get('X-Clinic-Id');
    if (!clinicId) throw badRequest('Falta la cabecera X-Clinic-Id');
    if (!UUID_RE.test(clinicId)) throw badRequest('X-Clinic-Id no válido');
    const { rows } = await query(
      'SELECT id, name FROM clinics WHERE id = $1 AND owner_user_id = $2',
      [clinicId, req.user.id],
    );
    if (!rows[0]) throw notFound('Clínica no encontrada');
    req.clinicId = rows[0].id;
    req.clinic = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

/** Validates that :param route params are UUIDs (avoids DB errors and probing). */
export function validateUuidParams(...names) {
  return (req, res, next) => {
    for (const n of names) {
      if (req.params[n] !== undefined && !UUID_RE.test(req.params[n])) return next(notFound());
    }
    next();
  };
}
