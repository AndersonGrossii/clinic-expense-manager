/** Shared domain constants (also exposed to the frontend through GET /api/meta). */

export const BILL_TYPES = Object.freeze([
  { code: 'AGUA', label: 'Agua' },
  { code: 'LUZ_GAS', label: 'Luz y gas' },
  { code: 'TELEFONO_INTERNET', label: 'Teléfono e Internet' },
  { code: 'COMPRAS_MATERIAL', label: 'Compras de material' },
  { code: 'LABORATORIO', label: 'Laboratorio' },
  { code: 'ALQUILER', label: 'Alquiler' },
  { code: 'SEGUROS', label: 'Seguros' },
  { code: 'MANTENIMIENTO', label: 'Mantenimiento y reparaciones' },
  { code: 'MARKETING', label: 'Marketing y publicidad' },
  { code: 'GESTORIA', label: 'Gestoría y asesoría' },
  { code: 'IMPUESTOS', label: 'Impuestos y tasas' },
  { code: 'GASTOS_GENERALES', label: 'Gastos generales' },
  { code: 'NOMINA', label: 'Nóminas' },
  { code: 'OTROS', label: 'Otros' },
]);

export const BILL_TYPE_CODES = BILL_TYPES.map((t) => t.code);
/** Types that the generic document endpoints may use (NOMINA only through the payroll module). */
export const DOCUMENT_BILL_TYPE_CODES = BILL_TYPE_CODES.filter((c) => c !== 'NOMINA');

/** Spanish IVA rates accepted (general, reducido, superreducido, 5% temporal, exento). */
export const IVA_RATES = Object.freeze([0, 4, 5, 10, 21]);

export const DEFAULT_FOLDERS = Object.freeze([
  { name: 'Facturas Agua', color: '#0EA5E9', default_bill_type: 'AGUA', is_system_payroll: false },
  { name: 'Facturas Compras', color: '#8B5CF6', default_bill_type: 'COMPRAS_MATERIAL', is_system_payroll: false },
  { name: 'Nóminas', color: '#F59E0B', default_bill_type: 'NOMINA', is_system_payroll: true },
  { name: 'Gastos Generales', color: '#10B981', default_bill_type: 'GASTOS_GENERALES', is_system_payroll: false },
]);

export const ALLOWED_UPLOADS = Object.freeze({
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
});
