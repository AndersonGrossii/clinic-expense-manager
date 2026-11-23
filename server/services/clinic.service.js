import { query, withTransaction } from '../../database/db.js';
import { DEFAULT_FOLDERS } from '../utils/constants.js';
import { notFound } from '../utils/errors.js';

const PALETTE = ['#0EA5E9', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6', '#6366F1'];

export async function listClinics(userId) {
  const { rows } = await query(
    `SELECT c.id, c.name, c.tax_id_cif, c.address, c.color, c.currency, c.created_at,
            (SELECT COUNT(*)::int FROM documents d WHERE d.clinic_id = c.id) AS document_count
       FROM clinics c
      WHERE c.owner_user_id = $1
      ORDER BY c.created_at ASC`,
    [userId],
  );
  return rows;
}

/** Creates a clinic and seeds its default folders. Accepts an optional transaction client. */
export async function createClinic(userId, data, client = null) {
  const run = async (c) => {
    const { rows: countRows } = await c.query('SELECT COUNT(*)::int AS n FROM clinics WHERE owner_user_id = $1', [userId]);
    const color = data.color || PALETTE[countRows[0].n % PALETTE.length];
    const { rows } = await c.query(
      `INSERT INTO clinics (owner_user_id, name, tax_id_cif, address, color)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, tax_id_cif, address, color, currency, created_at`,
      [userId, data.name, data.tax_id_cif ?? null, data.address ?? null, color],
    );
    const clinic = rows[0];
    for (const f of DEFAULT_FOLDERS) {
      await c.query(
        `INSERT INTO folders (clinic_id, name, color, default_bill_type, is_system_payroll)
         VALUES ($1, $2, $3, $4, $5)`,
        [clinic.id, f.name, f.color, f.default_bill_type, f.is_system_payroll],
      );
    }
    return { ...clinic, document_count: 0 };
  };
  return client ? run(client) : withTransaction(run);
}

export async function updateClinic(userId, clinicId, data) {
  const fields = [];
  const params = [];
  for (const key of ['name', 'tax_id_cif', 'address', 'color']) {
    if (data[key] !== undefined) {
      params.push(data[key]);
      fields.push(`${key} = $${params.length}`);
    }
  }
  if (!fields.length) {
    const { rows } = await query('SELECT * FROM clinics WHERE id = $1 AND owner_user_id = $2', [clinicId, userId]);
    if (!rows[0]) throw notFound('Clínica no encontrada');
    return rows[0];
  }
  params.push(clinicId, userId);
  const { rows } = await query(
    `UPDATE clinics SET ${fields.join(', ')}
      WHERE id = $${params.length - 1} AND owner_user_id = $${params.length}
      RETURNING id, name, tax_id_cif, address, color, currency, created_at`,
    params,
  );
  if (!rows[0]) throw notFound('Clínica no encontrada');
  return rows[0];
}
