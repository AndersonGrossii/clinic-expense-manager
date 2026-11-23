import { query, withTransaction } from '../../database/db.js';
import { reconcileNomina, fromCents } from '../utils/money.js';
import { badRequest, notFound } from '../utils/errors.js';
import { removeStored } from '../config/storage.js';
import { getPayrollFolder } from './folder.service.js';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// ── Workers ─────────────────────────────────────────────────────────
export async function listWorkers(clinicId) {
  const { rows } = await query(
    `SELECT w.id, w.full_name, w.dni_nie, w.role_title, w.is_active, w.created_at,
            COUNT(n.id)::int AS nomina_count,
            COALESCE(SUM(n.total_company_cost), 0)::numeric(14,2)::text AS total_company_cost
       FROM workers w
       LEFT JOIN nominas n ON n.worker_id = w.id AND n.clinic_id = w.clinic_id
      WHERE w.clinic_id = $1
      GROUP BY w.id
      ORDER BY w.is_active DESC, LOWER(w.full_name)`,
    [clinicId],
  );
  return rows;
}

async function getWorker(clinicId, id, client) {
  const run = client || { query };
  const { rows } = await run.query(
    'SELECT id, full_name, dni_nie, role_title, is_active, created_at FROM workers WHERE id = $1 AND clinic_id = $2',
    [id, clinicId],
  );
  if (!rows[0]) throw notFound('Trabajador no encontrado');
  return rows[0];
}

export async function createWorker(clinicId, data) {
  const { rows } = await query(
    `INSERT INTO workers (clinic_id, full_name, dni_nie, role_title, is_active)
     VALUES ($1, $2, $3, $4, COALESCE($5, TRUE))
     RETURNING id, full_name, dni_nie, role_title, is_active, created_at`,
    [clinicId, data.full_name, data.dni_nie ?? null, data.role_title ?? null, data.is_active ?? null],
  );
  return { ...rows[0], nomina_count: 0, total_company_cost: '0.00' };
}

export async function updateWorker(clinicId, id, data) {
  const current = await getWorker(clinicId, id);
  const m = { ...current, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) };
  const { rows } = await query(
    `UPDATE workers SET full_name = $3, dni_nie = $4, role_title = $5, is_active = $6
      WHERE id = $1 AND clinic_id = $2
      RETURNING id, full_name, dni_nie, role_title, is_active, created_at`,
    [id, clinicId, m.full_name, m.dni_nie ?? null, m.role_title ?? null, m.is_active],
  );
  return rows[0];
}

export async function deleteWorker(clinicId, id) {
  await getWorker(clinicId, id);
  const { rows } = await query('SELECT COUNT(*)::int AS n FROM nominas WHERE worker_id = $1 AND clinic_id = $2', [id, clinicId]);
  if (rows[0].n > 0) throw badRequest('El trabajador tiene nóminas registradas. Desactívelo en lugar de eliminarlo.');
  await query('DELETE FROM workers WHERE id = $1 AND clinic_id = $2', [id, clinicId]);
}

// ── Nóminas ─────────────────────────────────────────────────────────
const NOMINA_COLS = `n.id, n.worker_id, w.full_name AS worker_name, w.role_title AS worker_role,
  n.document_id, n.period_year, n.period_month,
  n.gross_salary::text, n.irpf_withholding::text, n.social_security_worker::text,
  n.social_security_company::text, n.net_salary::text, n.total_company_cost::text,
  d.file_original_name, d.file_mime_type, d.notes, n.created_at, n.updated_at`;
const NOMINA_FROM = `FROM nominas n
  JOIN workers w ON w.id = n.worker_id AND w.clinic_id = n.clinic_id
  JOIN documents d ON d.id = n.document_id AND d.clinic_id = n.clinic_id`;

export async function listNominas(clinicId, { year, workerId } = {}) {
  const params = [clinicId];
  const where = ['n.clinic_id = $1'];
  if (year) { params.push(year); where.push(`n.period_year = $${params.length}`); }
  if (workerId) { params.push(workerId); where.push(`n.worker_id = $${params.length}`); }
  const [items, totals] = await Promise.all([
    query(`SELECT ${NOMINA_COLS} ${NOMINA_FROM} WHERE ${where.join(' AND ')}
            ORDER BY n.period_year DESC, n.period_month DESC, LOWER(w.full_name)`, params),
    query(`SELECT COUNT(*)::int AS count,
                  COALESCE(SUM(n.gross_salary),0)::numeric(14,2)::text AS gross_salary,
                  COALESCE(SUM(n.irpf_withholding),0)::numeric(14,2)::text AS irpf_withholding,
                  COALESCE(SUM(n.social_security_worker),0)::numeric(14,2)::text AS social_security_worker,
                  COALESCE(SUM(n.social_security_company),0)::numeric(14,2)::text AS social_security_company,
                  COALESCE(SUM(n.net_salary),0)::numeric(14,2)::text AS net_salary,
                  COALESCE(SUM(n.total_company_cost),0)::numeric(14,2)::text AS total_company_cost
             FROM nominas n WHERE ${where.join(' AND ')}`, params),
  ]);
  return { items: items.rows, totals: totals.rows[0] };
}

export async function getNomina(clinicId, id, client) {
  const run = client || { query };
  const { rows } = await run.query(`SELECT ${NOMINA_COLS}, d.file_path ${NOMINA_FROM} WHERE n.id = $1 AND n.clinic_id = $2`, [id, clinicId]);
  if (!rows[0]) throw notFound('Nómina no encontrada');
  return rows[0];
}

const strip = ({ file_path, ...rest }) => rest;

function lastDayOfMonth(y, m) {
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export async function createNomina(clinicId, userId, data, file) {
  const money = reconcileNomina({
    gross: data.gross_salary, irpf: data.irpf_withholding, ssWorker: data.social_security_worker,
    ssCompany: data.social_security_company, net: data.net_salary,
  });
  if (!money.ok) throw badRequest(money.error);

  const id = await withTransaction(async (c) => {
    const worker = await getWorker(clinicId, data.worker_id, c);
    const dup = await c.query(
      'SELECT 1 FROM nominas WHERE clinic_id = $1 AND worker_id = $2 AND period_year = $3 AND period_month = $4',
      [clinicId, data.worker_id, data.period_year, data.period_month],
    );
    if (dup.rows[0]) throw badRequest(`Ya existe la nómina de ${worker.full_name} para ${MONTHS[data.period_month - 1]} ${data.period_year}`);
    const folderId = await getPayrollFolder(clinicId, c);
    const cost = fromCents(money.companyCost);
    const doc = await c.query(
      `INSERT INTO documents (clinic_id, folder_id, name, vendor_name, bill_type, document_date,
          base_amount, tax_iva_rate, tax_iva_amount, total_amount,
          file_path, file_original_name, file_mime_type, file_size_bytes, notes, created_by)
       VALUES ($1,$2,$3,$4,'NOMINA',$5,$6,0,0,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [clinicId, folderId, `Nómina ${MONTHS[data.period_month - 1]} ${data.period_year} - ${worker.full_name}`,
        worker.full_name, lastDayOfMonth(data.period_year, data.period_month), cost,
        file.relativePath, file.originalname.slice(0, 255), file.detectedMime, file.size, data.notes ?? null, userId],
    );
    const nom = await c.query(
      `INSERT INTO nominas (clinic_id, worker_id, document_id, period_year, period_month, gross_salary,
          irpf_withholding, social_security_worker, social_security_company, net_salary, total_company_cost)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [clinicId, data.worker_id, doc.rows[0].id, data.period_year, data.period_month, fromCents(money.gross),
        fromCents(money.irpf), fromCents(money.ssWorker), fromCents(money.ssCompany), fromCents(money.net), cost],
    );
    return nom.rows[0].id;
  });
  return strip(await getNomina(clinicId, id));
}

export async function updateNomina(clinicId, id, data, file) {
  let oldFile = null;
  await withTransaction(async (c) => {
    const cur = await getNomina(clinicId, id, c);
    const m = { ...cur, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) };
    const money = reconcileNomina({
      gross: m.gross_salary, irpf: m.irpf_withholding, ssWorker: m.social_security_worker,
      ssCompany: m.social_security_company,
      // If user changed components but not net, recompute net automatically.
      net: data.net_salary !== undefined ? data.net_salary : undefined,
    });
    if (!money.ok) throw badRequest(money.error);
    const worker = await getWorker(clinicId, m.worker_id, c);
    const cost = fromCents(money.companyCost);
    await c.query(
      `UPDATE nominas SET worker_id = $3, period_year = $4, period_month = $5, gross_salary = $6,
              irpf_withholding = $7, social_security_worker = $8, social_security_company = $9,
              net_salary = $10, total_company_cost = $11, updated_at = NOW()
        WHERE id = $1 AND clinic_id = $2`,
      [id, clinicId, m.worker_id, m.period_year, m.period_month, fromCents(money.gross), fromCents(money.irpf),
        fromCents(money.ssWorker), fromCents(money.ssCompany), fromCents(money.net), cost],
    );
    await c.query(
      `UPDATE documents SET name = $3, vendor_name = $4, document_date = $5,
              base_amount = $6, tax_iva_rate = 0, tax_iva_amount = 0, total_amount = $6, notes = $7,
              file_path = COALESCE($8, file_path), file_original_name = COALESCE($9, file_original_name),
              file_mime_type = COALESCE($10, file_mime_type), file_size_bytes = COALESCE($11, file_size_bytes),
              updated_at = NOW()
        WHERE id = $1 AND clinic_id = $2`,
      [cur.document_id, clinicId, `Nómina ${MONTHS[m.period_month - 1]} ${m.period_year} - ${worker.full_name}`,
        worker.full_name, lastDayOfMonth(m.period_year, m.period_month), cost, m.notes ?? null,
        file?.relativePath ?? null, file ? file.originalname.slice(0, 255) : null, file?.detectedMime ?? null, file?.size ?? null],
    );
    if (file) oldFile = cur.file_path;
  });
  if (oldFile) await removeStored(clinicId, oldFile);
  return strip(await getNomina(clinicId, id));
}

export async function deleteNomina(clinicId, id) {
  const filePath = await withTransaction(async (c) => {
    const cur = await getNomina(clinicId, id, c);
    await c.query('DELETE FROM documents WHERE id = $1 AND clinic_id = $2', [cur.document_id, clinicId]); // cascades nómina
    return cur.file_path;
  });
  await removeStored(clinicId, filePath);
}
