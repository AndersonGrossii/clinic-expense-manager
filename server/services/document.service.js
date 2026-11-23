import { query, withTransaction } from '../../database/db.js';
import { reconcileInvoice, fromCents } from '../utils/money.js';
import { badRequest, notFound } from '../utils/errors.js';
import { removeStored } from '../config/storage.js';

export const DOC_COLS = `d.id, d.folder_id, f.name AS folder_name, f.color AS folder_color,
  d.name, d.vendor_name, d.invoice_number, d.bill_type, d.document_date,
  d.base_amount::text, d.tax_iva_rate::text, d.tax_iva_amount::text, d.total_amount::text,
  d.file_original_name, d.file_mime_type, d.file_size_bytes::int, d.notes,
  d.created_at, d.updated_at,
  n.id AS nomina_id`;

const FROM = `FROM documents d
  JOIN folders f ON f.id = d.folder_id AND f.clinic_id = d.clinic_id
  LEFT JOIN nominas n ON n.document_id = d.id AND n.clinic_id = d.clinic_id`;

const SORTS = {
  date_desc: 'd.document_date DESC, d.created_at DESC',
  date_asc: 'd.document_date ASC, d.created_at ASC',
  total_desc: 'd.total_amount DESC, d.document_date DESC',
  total_asc: 'd.total_amount ASC, d.document_date DESC',
  name_asc: 'LOWER(d.name) ASC',
};

function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

/** Build a WHERE clause ALWAYS scoped to the clinic. Shared by search, dashboard and reports. */
export function buildFilter(clinicId, filters = {}) {
  const params = [clinicId];
  const where = ['d.clinic_id = $1'];
  let { from, to } = filters;
  if (filters.month) ({ from, to } = monthRange(filters.month));
  if (filters.year && !from && !to) { from = `${filters.year}-01-01`; to = `${filters.year}-12-31`; }
  if (from) { params.push(from); where.push(`d.document_date >= $${params.length}`); }
  if (to) { params.push(to); where.push(`d.document_date <= $${params.length}`); }
  if (filters.type?.length) { params.push(filters.type); where.push(`d.bill_type = ANY($${params.length})`); }
  if (filters.folderId) { params.push(filters.folderId); where.push(`d.folder_id = $${params.length}`); }
  if (filters.q) {
    const escaped = filters.q.replace(/[\\%_]/g, (c) => `\\${c}`);
    params.push(`%${escaped}%`);
    where.push(`(d.name || ' ' || COALESCE(d.vendor_name, '') || ' ' || COALESCE(d.invoice_number, '')) ILIKE $${params.length}`);
  }
  return { where: where.join(' AND '), params, from, to };
}

export async function searchDocuments(clinicId, filters) {
  const { where, params, from, to } = buildFilter(clinicId, filters);
  const offset = (filters.page - 1) * filters.limit;

  const [items, totals] = await Promise.all([
    query(
      `SELECT ${DOC_COLS} ${FROM} WHERE ${where}
        ORDER BY ${SORTS[filters.sort] || SORTS.date_desc}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filters.limit, offset],
    ),
    query(
      `SELECT COUNT(*)::int AS count,
              COALESCE(SUM(d.base_amount), 0)::numeric(14,2)::text AS base_amount,
              COALESCE(SUM(d.tax_iva_amount), 0)::numeric(14,2)::text AS tax_iva_amount,
              COALESCE(SUM(d.total_amount), 0)::numeric(14,2)::text AS total_amount
         FROM documents d WHERE ${where}`,
      params,
    ),
  ]);
  const t = totals.rows[0];
  return {
    items: items.rows,
    totals: { base_amount: t.base_amount, tax_iva_amount: t.tax_iva_amount, total_amount: t.total_amount },
    pagination: { page: filters.page, limit: filters.limit, total: t.count, pages: Math.max(1, Math.ceil(t.count / filters.limit)) },
    appliedFilters: { ...filters, from: from ?? null, to: to ?? null },
  };
}

export async function getDocument(clinicId, id, client) {
  const run = client || { query };
  const { rows } = await run.query(
    `SELECT ${DOC_COLS}, d.file_path ${FROM} WHERE d.id = $1 AND d.clinic_id = $2`,
    [id, clinicId],
  );
  if (!rows[0]) throw notFound('Documento no encontrado');
  return rows[0];
}

function publicDoc(doc) {
  const { file_path, ...rest } = doc; // never expose storage paths
  return rest;
}

async function assertFolder(clinicId, folderId, client) {
  const run = client || { query };
  const { rows } = await run.query('SELECT id FROM folders WHERE id = $1 AND clinic_id = $2', [folderId, clinicId]);
  if (!rows[0]) throw badRequest('La carpeta no existe en esta clínica');
}

export async function createDocument(clinicId, userId, data, file) {
  const money = reconcileInvoice({
    base: data.base_amount, iva: data.tax_iva_amount, total: data.total_amount, rate: data.tax_iva_rate,
  });
  if (!money.ok) throw badRequest(money.error);
  await assertFolder(clinicId, data.folder_id);

  const { rows } = await query(
    `INSERT INTO documents (clinic_id, folder_id, name, vendor_name, invoice_number, bill_type, document_date,
        base_amount, tax_iva_rate, tax_iva_amount, total_amount,
        file_path, file_original_name, file_mime_type, file_size_bytes, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING id`,
    [clinicId, data.folder_id, data.name, data.vendor_name ?? null, data.invoice_number ?? null,
      data.bill_type, data.document_date, fromCents(money.base), data.tax_iva_rate,
      fromCents(money.iva), fromCents(money.total), file.relativePath,
      file.originalname.slice(0, 255), file.detectedMime, file.size, data.notes ?? null, userId],
  );
  return publicDoc(await getDocument(clinicId, rows[0].id));
}

export async function updateDocument(clinicId, id, data, file) {
  const current = await getDocument(clinicId, id);
  if (current.nomina_id || current.bill_type === 'NOMINA') {
    throw badRequest('Este documento es una nómina: edítelo desde el módulo de Nóminas');
  }
  const merged = { ...current, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) };

  // If any money field or the rate changed, recompute from what the user sent.
  const moneyTouched = ['base_amount', 'tax_iva_amount', 'total_amount', 'tax_iva_rate'].some((k) => data[k] !== undefined);
  let base = current.base_amount; let iva = current.tax_iva_amount; let total = current.total_amount;
  if (moneyTouched) {
    const sentAny = ['base_amount', 'tax_iva_amount', 'total_amount'].some((k) => data[k] !== undefined);
    const money = reconcileInvoice(sentAny
      ? { base: data.base_amount, iva: data.tax_iva_amount, total: data.total_amount, rate: merged.tax_iva_rate }
      : { base: current.base_amount, rate: merged.tax_iva_rate }); // only rate changed → recompute IVA from base
    if (!money.ok) throw badRequest(money.error);
    base = fromCents(money.base); iva = fromCents(money.iva); total = fromCents(money.total);
  }
  if (data.folder_id) await assertFolder(clinicId, data.folder_id);

  await query(
    `UPDATE documents SET folder_id = $3, name = $4, vendor_name = $5, invoice_number = $6, bill_type = $7,
            document_date = $8, base_amount = $9, tax_iva_rate = $10, tax_iva_amount = $11, total_amount = $12,
            notes = $13,
            file_path = COALESCE($14, file_path), file_original_name = COALESCE($15, file_original_name),
            file_mime_type = COALESCE($16, file_mime_type), file_size_bytes = COALESCE($17, file_size_bytes),
            updated_at = NOW()
      WHERE id = $1 AND clinic_id = $2`,
    [id, clinicId, merged.folder_id, merged.name, merged.vendor_name ?? null, merged.invoice_number ?? null,
      merged.bill_type, merged.document_date, base, merged.tax_iva_rate, iva, total, merged.notes ?? null,
      file?.relativePath ?? null, file ? file.originalname.slice(0, 255) : null,
      file?.detectedMime ?? null, file?.size ?? null],
  );
  if (file) await removeStored(clinicId, current.file_path); // old file removed after commit
  return publicDoc(await getDocument(clinicId, id));
}

export async function deleteDocument(clinicId, id) {
  const filePath = await withTransaction(async (c) => {
    const doc = await getDocument(clinicId, id, c);
    // Deleting a payroll document also deletes its nómina row (FK cascade).
    await c.query('DELETE FROM documents WHERE id = $1 AND clinic_id = $2', [id, clinicId]);
    return doc.file_path;
  });
  await removeStored(clinicId, filePath);
}

export { publicDoc };
