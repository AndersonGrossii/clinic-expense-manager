/**
 * Money helpers — all arithmetic is done in integer cents to avoid floating point errors.
 * Accountant rule: Base + IVA = Total (exact), IVA = round(base × rate / 100) ± 1 cent.
 */

const MONEY_RE = /^\d{1,10}([.,]\d{1,2})?$/;

/** Parse "1234.5", "1234,50", 1234.5 → 123450 (cents). Returns null if invalid. */
export function toCents(value) {
  if (value === null || value === undefined || value === '') return null;
  let str = typeof value === 'number' ? value.toFixed(2) : String(value).trim();
  // Accept "1.234,56" (es-ES thousands) → "1234,56"
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(str)) str = str.replace(/\./g, '');
  if (!MONEY_RE.test(str)) return null;
  const [intPart, decPart = ''] = str.replace(',', '.').split('.');
  return Number.parseInt(intPart, 10) * 100 + Number.parseInt((decPart + '00').slice(0, 2), 10);
}

/** 123450 → "1234.50" (string for NUMERIC columns). */
export function fromCents(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** IVA in cents for a base (cents) and a rate (e.g. 21 or "10.5"), rounded half-up. */
export function ivaFromBase(baseCents, rate) {
  const rateHundredths = Math.round(Number(rate) * 100); // 21 → 2100
  // base * rate / 100 → cents; using integers: base * rateHundredths / 10000
  return Math.floor((baseCents * rateHundredths + 5000) / 10000);
}

/**
 * Validates and normalizes invoice amounts.
 * Accepts any two of base/iva/total plus rate; computes the missing value.
 * @returns {{ ok: true, base: number, iva: number, total: number } | { ok: false, error: string }}
 */
export function reconcileInvoice({ base, iva, total, rate }) {
  if (!Number.isFinite(Number(rate)) || Number(rate) < 0) return { ok: false, error: 'Tipo de IVA no válido' };
  const given = (v) => !(v === null || v === undefined || v === '');
  let b = given(base) ? toCents(base) : null;
  let i = given(iva) ? toCents(iva) : null;
  let t = given(total) ? toCents(total) : null;
  if ((given(base) && b === null) || (given(iva) && i === null) || (given(total) && t === null)) {
    return { ok: false, error: 'Formato de importe no válido (máx. 2 decimales)' };
  }

  if (b !== null) {
    if (i === null && t === null) i = ivaFromBase(b, rate);
    else if (i === null) i = t - b;
    if (t === null) t = b + i;
  } else if (t !== null) {
    if (i === null) {
      // Derive base from total and rate: base = total / (1 + rate/100)
      const rh = Math.round(Number(rate) * 100);
      b = Math.round((t * 10000) / (10000 + rh));
      i = t - b;
    } else {
      b = t - i;
    }
  } else {
    return { ok: false, error: 'Debe indicar la base imponible o el total' };
  }

  if (b < 0 || i < 0 || t < 0) return { ok: false, error: 'Los importes no pueden ser negativos' };
  if (b + i !== t) {
    return { ok: false, error: `Base (${fromCents(b)}) + IVA (${fromCents(i)}) no coincide con el total (${fromCents(t)})` };
  }
  const expected = ivaFromBase(b, rate);
  if (Math.abs(expected - i) > 1) {
    return { ok: false, error: `La cuota de IVA (${fromCents(i)}) no corresponde al ${rate}% de la base (esperado ${fromCents(expected)})` };
  }
  return { ok: true, base: b, iva: i, total: t };
}

/** Payroll rules: net = gross − irpf − ssWorker ; companyCost = gross + ssCompany. */
export function reconcileNomina({ gross, irpf, ssWorker, ssCompany, net }) {
  const opt = (v) => (v === null || v === undefined || v === '' ? 0 : toCents(v));
  const g = toCents(gross);
  const ir = opt(irpf);
  const sw = opt(ssWorker);
  const sc = opt(ssCompany);
  if (g === null || ir === null || sw === null || sc === null) {
    return { ok: false, error: 'Importes de nómina no válidos' };
  }
  const expectedNet = g - ir - sw;
  if (expectedNet < 0) return { ok: false, error: 'Las retenciones superan el salario bruto' };
  let n = net === undefined || net === null || net === '' ? expectedNet : toCents(net);
  if (n === null) return { ok: false, error: 'Salario neto no válido' };
  if (n !== expectedNet) {
    return { ok: false, error: `Neto (${fromCents(n)}) ≠ Bruto − IRPF − SS trabajador (${fromCents(expectedNet)})` };
  }
  return { ok: true, gross: g, irpf: ir, ssWorker: sw, ssCompany: sc, net: n, companyCost: g + sc };
}
