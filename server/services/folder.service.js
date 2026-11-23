import { query } from '../../database/db.js';
import { conflict, notFound, badRequest } from '../utils/errors.js';

const FOLDER_COLS = `f.id, f.name, f.color, f.default_bill_type, f.is_system_payroll, f.created_at`;

export async function listFolders(clinicId) {
  const { rows } = await query(
    `SELECT ${FOLDER_COLS},
            COUNT(d.id)::int AS document_count,
            COALESCE(SUM(d.total_amount), 0)::numeric(14,2)::text AS total_amount,
            MAX(d.document_date) AS last_document_date
       FROM folders f
       LEFT JOIN documents d ON d.folder_id = f.id AND d.clinic_id = f.clinic_id
      WHERE f.clinic_id = $1
      GROUP BY f.id
      ORDER BY f.is_system_payroll DESC, LOWER(f.name) ASC`,
    [clinicId],
  );
  return rows;
}

export async function getFolder(clinicId, folderId) {
  const { rows } = await query(
    `SELECT ${FOLDER_COLS},
            (SELECT COUNT(*)::int FROM documents d WHERE d.folder_id = f.id AND d.clinic_id = f.clinic_id) AS document_count,
            (SELECT COALESCE(SUM(total_amount),0)::numeric(14,2)::text FROM documents d WHERE d.folder_id = f.id AND d.clinic_id = f.clinic_id) AS total_amount
       FROM folders f WHERE f.id = $1 AND f.clinic_id = $2`,
    [folderId, clinicId],
  );
  if (!rows[0]) throw notFound('Carpeta no encontrada');
  return rows[0];
}

export async function createFolder(clinicId, data) {
  const { rows } = await query(
    `INSERT INTO folders (clinic_id, name, color, default_bill_type)
     VALUES ($1, $2, COALESCE($3, '#2563EB'), $4)
     RETURNING id, name, color, default_bill_type, is_system_payroll, created_at`,
    [clinicId, data.name, data.color ?? null, data.default_bill_type ?? null],
  );
  return { ...rows[0], document_count: 0, total_amount: '0.00' };
}

export async function updateFolder(clinicId, folderId, data) {
  const current = await getFolder(clinicId, folderId);
  if (current.is_system_payroll && data.default_bill_type !== undefined && data.default_bill_type !== 'NOMINA') {
    // payroll folder keeps its type
    delete data.default_bill_type;
  }
  const { rows } = await query(
    `UPDATE folders
        SET name = COALESCE($3, name),
            color = COALESCE($4, color),
            default_bill_type = CASE WHEN $5::boolean THEN $6 ELSE default_bill_type END
      WHERE id = $1 AND clinic_id = $2
      RETURNING id, name, color, default_bill_type, is_system_payroll, created_at`,
    [folderId, clinicId, data.name ?? null, data.color ?? null,
      data.default_bill_type !== undefined, data.default_bill_type ?? null],
  );
  return { ...rows[0], document_count: current.document_count, total_amount: current.total_amount };
}

export async function deleteFolder(clinicId, folderId) {
  const folder = await getFolder(clinicId, folderId);
  if (folder.is_system_payroll) throw badRequest('La carpeta de Nóminas del sistema no se puede eliminar');
  if (folder.document_count > 0) {
    throw conflict(`La carpeta contiene ${folder.document_count} documento(s). Muévalos o elimínelos antes.`);
  }
  await query('DELETE FROM folders WHERE id = $1 AND clinic_id = $2', [folderId, clinicId]);
}

export async function getPayrollFolder(clinicId, client) {
  const run = client || { query };
  const { rows } = await run.query(
    'SELECT id FROM folders WHERE clinic_id = $1 AND is_system_payroll = TRUE',
    [clinicId],
  );
  if (rows[0]) return rows[0].id;
  const ins = await run.query(
    `INSERT INTO folders (clinic_id, name, color, default_bill_type, is_system_payroll)
     VALUES ($1, 'Nóminas', '#F59E0B', 'NOMINA', TRUE)
     ON CONFLICT (clinic_id, LOWER(name)) DO UPDATE SET is_system_payroll = TRUE
     RETURNING id`,
    [clinicId],
  );
  return ins.rows[0].id;
}
