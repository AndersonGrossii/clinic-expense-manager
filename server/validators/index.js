import { z } from 'zod';
import { DOCUMENT_BILL_TYPE_CODES, BILL_TYPE_CODES, IVA_RATES } from '../utils/constants.js';
import { badRequest } from '../utils/errors.js';

// ── Reusable primitives ──────────────────────────────────────────────
const emptyToUndef = (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const trimmed = (max) => z.preprocess(emptyToUndef, z.string().trim().max(max));
const optText = (max) => z.preprocess(emptyToUndef, z.string().trim().max(max).optional().nullable());

export const uuid = z.string().uuid('Identificador no válido');

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha con formato AAAA-MM-DD').refine((s) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
    && d.getUTCFullYear() >= 2000 && d.getUTCFullYear() <= 2100;
}, 'Fecha no válida');

const moneyStr = z.preprocess(
  (v) => (v === null || v === undefined || v === '' ? undefined : String(v).trim()),
  z.string().regex(/^(\d{1,10}([.,]\d{1,2})?|\d{1,3}(\.\d{3})+(,\d{1,2})?)$/, 'Importe no válido (máx. 2 decimales, sin negativos)').optional(),
);

const ivaRate = z.preprocess(
  (v) => (v === '' || v === undefined || v === null ? undefined : Number(String(v).replace(',', '.'))),
  z.number().refine((n) => IVA_RATES.includes(n), `Tipo de IVA permitido: ${IVA_RATES.join(', ')} %`),
);

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color hexadecimal #RRGGBB');
const boolish = z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean());

// ── Schemas ──────────────────────────────────────────────────────────
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email no válido').max(255),
  password: z.string().min(1, 'Contraseña requerida').max(200),
});

export const clinicCreateSchema = z.object({
  name: trimmed(150).pipe(z.string().min(2, 'Nombre de clínica requerido')),
  tax_id_cif: optText(50),
  address: optText(500),
  color: hexColor.optional(),
});
export const clinicUpdateSchema = clinicCreateSchema.partial();

export const folderCreateSchema = z.object({
  name: trimmed(120).pipe(z.string().min(1, 'Nombre de carpeta requerido')),
  color: hexColor.optional(),
  default_bill_type: z.preprocess(emptyToUndef, z.enum(DOCUMENT_BILL_TYPE_CODES).optional().nullable()),
});
export const folderUpdateSchema = folderCreateSchema.partial();

const documentFields = {
  folder_id: uuid,
  name: trimmed(255).pipe(z.string().min(1, 'Nombre / concepto requerido')),
  vendor_name: optText(200),
  invoice_number: optText(100),
  bill_type: z.enum(DOCUMENT_BILL_TYPE_CODES, { errorMap: () => ({ message: 'Tipo de factura no válido' }) }),
  document_date: isoDate,
  tax_iva_rate: ivaRate,
  base_amount: moneyStr,
  tax_iva_amount: moneyStr,
  total_amount: moneyStr,
  notes: optText(2000),
};

export const documentCreateSchema = z.object({
  ...documentFields,
  tax_iva_rate: ivaRate.default(21),
});
export const documentUpdateSchema = z.object(documentFields).partial();

export const documentSearchSchema = z.object({
  q: optText(200),
  from: z.preprocess(emptyToUndef, isoDate.optional()),
  to: z.preprocess(emptyToUndef, isoDate.optional()),
  type: z.preprocess(
    (v) => (typeof v === 'string' && v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined),
    z.array(z.enum(BILL_TYPE_CODES)).optional(),
  ),
  folderId: z.preprocess(emptyToUndef, uuid.optional()),
  month: z.preprocess(emptyToUndef, z.string().regex(/^\d{4}-\d{2}$/).optional()),
  sort: z.preprocess(emptyToUndef, z.enum(['date_desc', 'date_asc', 'total_desc', 'total_asc', 'name_asc']).default('date_desc')),
  page: z.preprocess(emptyToUndef, z.coerce.number().int().min(1).default(1)),
  limit: z.preprocess(emptyToUndef, z.coerce.number().int().min(1).max(500).default(50)),
});

export const periodSchema = z.object({
  from: z.preprocess(emptyToUndef, isoDate.optional()),
  to: z.preprocess(emptyToUndef, isoDate.optional()),
  year: z.preprocess(emptyToUndef, z.coerce.number().int().min(2000).max(2100).optional()),
});

export const workerCreateSchema = z.object({
  full_name: trimmed(150).pipe(z.string().min(2, 'Nombre del trabajador requerido')),
  dni_nie: optText(30),
  role_title: optText(100),
  is_active: boolish.optional(),
});
export const workerUpdateSchema = workerCreateSchema.partial();

export const nominaCreateSchema = z.object({
  worker_id: uuid,
  period_year: z.coerce.number().int().min(2000).max(2100),
  period_month: z.coerce.number().int().min(1).max(12),
  gross_salary: moneyStr.refine((v) => v !== undefined, 'Salario bruto requerido'),
  irpf_withholding: moneyStr,
  social_security_worker: moneyStr,
  social_security_company: moneyStr,
  net_salary: moneyStr,
  notes: optText(2000),
});
export const nominaUpdateSchema = nominaCreateSchema.partial();

/** Parse or throw a 400 with field-level details. */
export function parse(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    throw badRequest(details[0]?.message || 'Datos no válidos', details);
  }
  return result.data;
}
