import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

// Provide fallback env vars so unit tests run without a .env file
process.env.DATABASE_URL ??= 'postgres://unit:unit@localhost:5432/unit_test';
process.env.JWT_SECRET ??= 'unit-test-secret-with-more-than-32-chars';

const { toCents, fromCents, ivaFromBase, reconcileInvoice, reconcileNomina } = await import('../server/utils/money.js');
const {
  parse, documentCreateSchema, documentUpdateSchema, documentSearchSchema, periodSchema,
} = await import('../server/validators/index.js');
const { detectMime } = await import('../server/middlewares/upload.middleware.js');
const { resolveStored, STORAGE_ROOT } = await import('../server/config/storage.js');

test('money: toCents and fromCents handle integer cents & es-ES format', () => {
  assert.equal(toCents('123.45'), 12345);
  assert.equal(toCents('123,45'), 12345);
  assert.equal(toCents('1.234,56'), 123456);
  assert.equal(toCents('10.123'), 1012300); // es-ES thousands separator
  assert.equal(toCents(19.9), 1990);
  assert.equal(toCents('0'), 0);
  assert.equal(toCents('-10.00'), null);
  assert.equal(toCents('10,123'), null);
  assert.equal(toCents('10.1234'), null);
  assert.equal(fromCents(123456), '1234.56');
  assert.equal(fromCents(5), '0.05');
});

test('money: ivaFromBase rounds half-up without float drift', () => {
  assert.equal(ivaFromBase(10000, 21), 2100);
  assert.equal(ivaFromBase(3333, 21), 700); // 699.93 -> 700
  assert.equal(ivaFromBase(1005, 10), 101); // 100.5 -> 101
  assert.equal(ivaFromBase(50000, 0), 0);
});

test('accountant: reconcileInvoice validates 21%, 10%, 4%, 0% and total reverse-calc', () => {
  const r21 = reconcileInvoice({ base: '100.00', rate: 21 });
  assert.deepEqual(r21, { ok: true, base: 10000, iva: 2100, total: 12100 });

  const rRev = reconcileInvoice({ total: '110.00', rate: 10 });
  assert.deepEqual(rRev, { ok: true, base: 10000, iva: 1000, total: 11000 });

  const r4 = reconcileInvoice({ base: '50,00', iva: '2,00', total: '52,00', rate: 4 });
  assert.deepEqual(r4, { ok: true, base: 5000, iva: 200, total: 5200 });

  const r0 = reconcileInvoice({ base: '200.00', rate: 0 });
  assert.deepEqual(r0, { ok: true, base: 20000, iva: 0, total: 20000 });

  // Tolerance of ±1 cent on multi-line invoices
  const rTol = reconcileInvoice({ base: '100.00', iva: '21.01', total: '121.01', rate: 21 });
  assert.equal(rTol.ok, true);

  // Reject mismatch base + iva != total
  const badSum = reconcileInvoice({ base: '100.00', iva: '21.00', total: '125.00', rate: 21 });
  assert.equal(badSum.ok, false);

  // Reject > 1 cent IVA drift
  const badIva = reconcileInvoice({ base: '100.00', iva: '10.00', total: '110.00', rate: 21 });
  assert.equal(badIva.ok, false);
});

test('accountant: reconcileNomina enforces net and company cost formulas', () => {
  const ok = reconcileNomina({
    gross: '2000.00', irpf: '300.00', ssWorker: '120.00', ssCompany: '600.00',
  });
  assert.deepEqual(ok, {
    ok: true, gross: 200000, irpf: 30000, ssWorker: 12000, ssCompany: 60000, net: 158000, companyCost: 260000,
  });

  const mismatchNet = reconcileNomina({
    gross: '2000.00', irpf: '300.00', ssWorker: '120.00', ssCompany: '600.00', net: '1600.00',
  });
  assert.equal(mismatchNet.ok, false);

  const negativeNet = reconcileNomina({
    gross: '500.00', irpf: '400.00', ssWorker: '200.00', ssCompany: '100.00',
  });
  assert.equal(negativeNet.ok, false);
});

test('validators: documentUpdateSchema preserves omitted tax_iva_rate & blocks NOMINA', () => {
  const upd = parse(documentUpdateSchema, { name: 'Factura editada' });
  assert.equal(upd.name, 'Factura editada');
  assert.equal(upd.tax_iva_rate, undefined);

  assert.throws(() => parse(documentCreateSchema, {
    folder_id: '00000000-0000-4000-8000-000000000001',
    name: 'Test',
    bill_type: 'NOMINA',
    document_date: '2026-05-01',
    base_amount: '100.00',
  }));
});

test('validators: search and period schemas accept empty query strings', () => {
  const s = parse(documentSearchSchema, { q: '', from: '', to: '', folderId: '', month: '', sort: '', page: '', limit: '' });
  assert.equal(s.q, undefined);
  assert.equal(s.from, undefined);
  assert.equal(s.folderId, undefined);
  assert.equal(s.sort, 'date_desc');
  assert.equal(s.page, 1);

  const p = parse(periodSchema, { from: '', to: '', year: '' });
  assert.equal(p.year, undefined);

  // Optional document text fields accept empty strings cleanly
  const doc = parse(documentCreateSchema, {
    folder_id: '00000000-0000-4000-8000-000000000001',
    name: 'Recibo simple',
    vendor_name: '',
    invoice_number: '',
    notes: '',
    bill_type: 'AGUA',
    document_date: '2026-05-01',
    base_amount: '50.00',
  });
  assert.equal(doc.vendor_name, undefined);
  assert.equal(doc.invoice_number, undefined);
  assert.equal(doc.notes, undefined);
});

test('upload security: detectMime verifies real magic bytes and rejects spoofed files', () => {
  assert.equal(detectMime(Buffer.from('%PDF-1.7\n')), 'application/pdf');
  assert.equal(detectMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])), 'image/jpeg');
  assert.equal(detectMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png');
  assert.equal(detectMime(Buffer.from('RIFF\x00\x00\x00\x00WEBP')), 'image/webp');
  assert.equal(detectMime(Buffer.from('\x00\x00\x00\x18ftypheic\x00\x00')), 'image/heic');

  // Spoofed executable or text
  assert.equal(detectMime(Buffer.from('MZ\x90\x00\x03\x00')), null);
  assert.equal(detectMime(Buffer.from('just plain text')), null);
});

test('storage isolation: resolveStored stays strictly inside clinic folder', () => {
  const clinicA = '11111111-1111-4111-8111-111111111111';
  const clinicB = '22222222-2222-4222-8222-222222222222';
  const okPath = resolveStored(clinicA, `clinic_${clinicA}/2026/11/doc.pdf`);
  assert.equal(okPath, path.resolve(STORAGE_ROOT, `clinic_${clinicA}`, '2026', '11', 'doc.pdf'));

  assert.throws(() => resolveStored(clinicA, `clinic_${clinicB}/2026/11/doc.pdf`), /Path outside clinic storage/);
  assert.throws(() => resolveStored(clinicA, `clinic_${clinicA}/../../etc/passwd`), /Path outside clinic storage/);
});
