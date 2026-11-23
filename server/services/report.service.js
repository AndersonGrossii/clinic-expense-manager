import { query } from '../../database/db.js';
import { buildFilter } from './document.service.js';

const money = (expr) => `COALESCE(SUM(${expr}), 0)::numeric(14,2)::text`;

function defaultPeriod(filters) {
  if (filters.from || filters.to || filters.month) return filters;
  const year = filters.year || new Date().getFullYear();
  return { ...filters, from: `${year}-01-01`, to: `${year}-12-31` };
}

function monthsBetween(from, to) {
  const out = [];
  let [y, m] = from.slice(0, 7).split('-').map(Number);
  const [ty, tm] = to.slice(0, 7).split('-').map(Number);
  while ((y < ty || (y === ty && m <= tm)) && out.length < 60) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

export async function getDashboard(clinicId, rawFilters) {
  const filters = defaultPeriod(rawFilters);
  const { where, params, from, to } = buildFilter(clinicId, filters);

  const [kpi, monthly, byType, byFolder, recent] = await Promise.all([
    query(`SELECT COUNT(*)::int AS document_count,
                  ${money('d.base_amount')} AS base_amount,
                  ${money('d.tax_iva_amount')} AS tax_iva_amount,
                  ${money('d.total_amount')} AS total_amount,
                  ${money(`CASE WHEN d.bill_type = 'NOMINA' THEN d.total_amount END`)} AS nominas_amount,
                  ${money(`CASE WHEN d.bill_type <> 'NOMINA' THEN d.total_amount END`)} AS operating_amount
             FROM documents d WHERE ${where}`, params),
    query(`SELECT to_char(d.document_date, 'YYYY-MM') AS month, COUNT(*)::int AS count,
                  ${money('d.base_amount')} AS base_amount,
                  ${money('d.tax_iva_amount')} AS tax_iva_amount,
                  ${money('d.total_amount')} AS total_amount
             FROM documents d WHERE ${where}
            GROUP BY 1 ORDER BY 1`, params),
    query(`SELECT d.bill_type, COUNT(*)::int AS count,
                  ${money('d.base_amount')} AS base_amount,
                  ${money('d.tax_iva_amount')} AS tax_iva_amount,
                  ${money('d.total_amount')} AS total_amount
             FROM documents d WHERE ${where}
            GROUP BY d.bill_type ORDER BY SUM(d.total_amount) DESC`, params),
    query(`SELECT f.id AS folder_id, f.name AS folder_name, f.color, COUNT(*)::int AS count,
                  ${money('d.total_amount')} AS total_amount
             FROM documents d JOIN folders f ON f.id = d.folder_id AND f.clinic_id = d.clinic_id
            WHERE ${where}
            GROUP BY f.id ORDER BY SUM(d.total_amount) DESC`, params),
    query(`SELECT d.id, d.name, d.bill_type, d.document_date, d.total_amount::text, d.vendor_name
             FROM documents d WHERE ${where}
            ORDER BY d.document_date DESC, d.created_at DESC LIMIT 6`, params),
  ]);

  // Fill months with no data so the chart has a continuous axis.
  const byMonth = new Map(monthly.rows.map((r) => [r.month, r]));
  const months = from && to ? monthsBetween(from, to) : monthly.rows.map((r) => r.month);
  const series = months.map((m) => byMonth.get(m) || { month: m, count: 0, base_amount: '0.00', tax_iva_amount: '0.00', total_amount: '0.00' });

  return {
    period: { from: from ?? null, to: to ?? null },
    kpis: kpi.rows[0],
    monthly: series,
    byType: byType.rows,
    byFolder: byFolder.rows,
    recent: recent.rows,
  };
}

export async function getIvaReport(clinicId, year) {
  const { rows } = await query(
    `SELECT EXTRACT(QUARTER FROM d.document_date)::int AS quarter, d.tax_iva_rate::text AS rate,
            COUNT(*)::int AS count,
            ${money('d.base_amount')} AS base_amount,
            ${money('d.tax_iva_amount')} AS tax_iva_amount,
            ${money('d.total_amount')} AS total_amount
       FROM documents d
      WHERE d.clinic_id = $1 AND d.document_date BETWEEN $2 AND $3 AND d.bill_type <> 'NOMINA'
      GROUP BY 1, 2 ORDER BY 1, 2::numeric`,
    [clinicId, `${year}-01-01`, `${year}-12-31`],
  );
  const quarters = await query(
    `SELECT EXTRACT(QUARTER FROM d.document_date)::int AS quarter, COUNT(*)::int AS count,
            ${money('d.base_amount')} AS base_amount,
            ${money('d.tax_iva_amount')} AS tax_iva_amount,
            ${money('d.total_amount')} AS total_amount
       FROM documents d
      WHERE d.clinic_id = $1 AND d.document_date BETWEEN $2 AND $3 AND d.bill_type <> 'NOMINA'
      GROUP BY 1 ORDER BY 1`,
    [clinicId, `${year}-01-01`, `${year}-12-31`],
  );
  const total = await query(
    `SELECT COUNT(*)::int AS count, ${money('d.base_amount')} AS base_amount,
            ${money('d.tax_iva_amount')} AS tax_iva_amount, ${money('d.total_amount')} AS total_amount
       FROM documents d
      WHERE d.clinic_id = $1 AND d.document_date BETWEEN $2 AND $3 AND d.bill_type <> 'NOMINA'`,
    [clinicId, `${year}-01-01`, `${year}-12-31`],
  );
  const qMap = new Map(quarters.rows.map((q) => [q.quarter, q]));
  return {
    year,
    note: 'IVA soportado de facturas y tickets. Las nóminas están exentas de IVA y no se incluyen.',
    byQuarterAndRate: rows,
    quarters: [1, 2, 3, 4].map((q) => qMap.get(q) || { quarter: q, count: 0, base_amount: '0.00', tax_iva_amount: '0.00', total_amount: '0.00' }),
    total: total.rows[0],
  };
}

export async function getSpendReport(clinicId, year) {
  const range = [clinicId, `${year}-01-01`, `${year}-12-31`];
  const [matrix, byType, byMonth, byFolder, payroll, total, prev] = await Promise.all([
    query(`SELECT EXTRACT(MONTH FROM d.document_date)::int AS month, d.bill_type, ${money('d.total_amount')} AS total_amount
             FROM documents d WHERE d.clinic_id = $1 AND d.document_date BETWEEN $2 AND $3
            GROUP BY 1, 2`, range),
    query(`SELECT d.bill_type, COUNT(*)::int AS count, ${money('d.base_amount')} AS base_amount,
                  ${money('d.tax_iva_amount')} AS tax_iva_amount, ${money('d.total_amount')} AS total_amount
             FROM documents d WHERE d.clinic_id = $1 AND d.document_date BETWEEN $2 AND $3
            GROUP BY 1 ORDER BY SUM(d.total_amount) DESC`, range),
    query(`SELECT EXTRACT(MONTH FROM d.document_date)::int AS month, COUNT(*)::int AS count,
                  ${money('d.base_amount')} AS base_amount, ${money('d.tax_iva_amount')} AS tax_iva_amount,
                  ${money('d.total_amount')} AS total_amount
             FROM documents d WHERE d.clinic_id = $1 AND d.document_date BETWEEN $2 AND $3
            GROUP BY 1 ORDER BY 1`, range),
    query(`SELECT f.name AS folder_name, f.color, COUNT(*)::int AS count, ${money('d.total_amount')} AS total_amount
             FROM documents d JOIN folders f ON f.id = d.folder_id AND f.clinic_id = d.clinic_id
            WHERE d.clinic_id = $1 AND d.document_date BETWEEN $2 AND $3
            GROUP BY f.id ORDER BY SUM(d.total_amount) DESC`, range),
    query(`SELECT COUNT(*)::int AS count, COUNT(DISTINCT n.worker_id)::int AS workers,
                  ${money('n.gross_salary')} AS gross_salary, ${money('n.irpf_withholding')} AS irpf_withholding,
                  ${money('n.social_security_worker')} AS social_security_worker,
                  ${money('n.social_security_company')} AS social_security_company,
                  ${money('n.net_salary')} AS net_salary, ${money('n.total_company_cost')} AS total_company_cost
             FROM nominas n WHERE n.clinic_id = $1 AND n.period_year = $2`, [clinicId, year]),
    query(`SELECT COUNT(*)::int AS count, ${money('d.base_amount')} AS base_amount,
                  ${money('d.tax_iva_amount')} AS tax_iva_amount, ${money('d.total_amount')} AS total_amount
             FROM documents d WHERE d.clinic_id = $1 AND d.document_date BETWEEN $2 AND $3`, range),
    query(`SELECT ${money('d.total_amount')} AS total_amount
             FROM documents d WHERE d.clinic_id = $1 AND d.document_date BETWEEN $2 AND $3`,
    [clinicId, `${year - 1}-01-01`, `${year - 1}-12-31`]),
  ]);
  const mMap = new Map(byMonth.rows.map((r) => [r.month, r]));
  return {
    year,
    matrix: matrix.rows,
    byType: byType.rows,
    byMonth: Array.from({ length: 12 }, (_, i) => mMap.get(i + 1) || { month: i + 1, count: 0, base_amount: '0.00', tax_iva_amount: '0.00', total_amount: '0.00' }),
    byFolder: byFolder.rows,
    payroll: payroll.rows[0],
    total: total.rows[0],
    previousYearTotal: prev.rows[0].total_amount,
  };
}
