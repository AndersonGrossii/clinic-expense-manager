import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';

// Test isolation: load dotenv only if present, fallback defaults for env parsing
import 'dotenv/config';
process.env.JWT_SECRET ??= 'integration-test-secret-minimum-32-chars';

const { pool } = await import('../database/db.js');
const { createApp } = await import('../server/app.js');
const { STORAGE_ROOT } = await import('../server/config/storage.js');

async function isDbReady() {
  try {
    await pool.query('SELECT 1 FROM users LIMIT 1');
    return true;
  } catch {
    return false;
  }
}

const dbReady = await isDbReady();
if (!dbReady) await pool.end().catch(() => {});

const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
const JPG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

test('integration: full auth, clinic isolation, upload security, CRUD & accountant reconciliation', { skip: !dbReady && 'PostgreSQL not reachable (start with: docker compose up -d db && npm run migrate)' }, async () => {
  const email = `qa_${crypto.randomUUID().slice(0, 8)}@test.local`;
  const password = 'QaStrongPassword!99';
  const hash = await bcrypt.hash(password, 10);

  const { rows: [user] } = await pool.query(
    'INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id',
    [email, hash, 'QA Tester'],
  );

  await fs.mkdir(STORAGE_ROOT, { recursive: true });
  const app = createApp();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  let cookieHeader = '';
  const createdClinicIds = [];

  async function apiFetch(route, { method = 'GET', clinicId, body, cookie = cookieHeader } = {}) {
    const headers = {};
    if (cookie) headers.Cookie = cookie;
    if (clinicId) headers['X-Clinic-Id'] = clinicId;
    let payload = body;
    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(`${baseUrl}/api${route}`, { method, headers, body: payload });
    const ct = res.headers.get('content-type') || '';
    const data = res.status === 204 ? null : ct.includes('application/json') ? await res.json() : await res.arrayBuffer();
    return { status: res.status, headers: res.headers, data };
  }

  try {
    // 1. Auth checks
    const unauth = await apiFetch('/clinics', { cookie: '' });
    assert.equal(unauth.status, 401);

    const badLogin = await apiFetch('/auth/login', {
      method: 'POST', cookie: '', body: { email, password: 'wrong' },
    });
    assert.equal(badLogin.status, 401);

    const loginRes = await apiFetch('/auth/login', {
      method: 'POST', cookie: '', body: { email, password },
    });
    assert.equal(loginRes.status, 200);
    const setCookies = loginRes.headers.getSetCookie();
    const sessionCookie = setCookies.find((c) => c.startsWith('ce_session='));
    assert.ok(sessionCookie, 'ce_session cookie must be set');
    assert.match(sessionCookie, /HttpOnly/i);
    assert.match(sessionCookie, /SameSite=Strict/i);
    assert.match(sessionCookie, /Max-Age=25200/i); // 7 hours = 25200s
    cookieHeader = sessionCookie.split(';')[0];

    // 2. Create two clinics + verify default folders
    const cA = await apiFetch('/clinics', { method: 'POST', body: { name: 'Clínica QA Norte' } });
    const cB = await apiFetch('/clinics', { method: 'POST', body: { name: 'Clínica QA Sur' } });
    assert.equal(cA.status, 201);
    assert.equal(cB.status, 201);
    const clinicA = cA.data;
    const clinicB = cB.data;
    createdClinicIds.push(clinicA.id, clinicB.id);

    const foldersA = (await apiFetch('/folders', { clinicId: clinicA.id })).data;
    assert.equal(foldersA.length, 4);
    const aguaFolderA = foldersA.find((f) => f.name === 'Facturas Agua');
    const comprasFolderA = foldersA.find((f) => f.name === 'Facturas Compras');
    assert.ok(aguaFolderA && comprasFolderA);

    // 3. Upload valid PDF + PNG in Clinic A, and reject spoofed image
    const fd1 = new FormData();
    fd1.append('file', new Blob([PDF_BYTES], { type: 'application/pdf' }), 'agua-marzo.pdf');
    fd1.append('folder_id', aguaFolderA.id);
    fd1.append('name', 'Factura Agua Marzo');
    fd1.append('bill_type', 'AGUA');
    fd1.append('document_date', '2026-03-15');
    fd1.append('tax_iva_rate', '10');
    fd1.append('base_amount', '100.00');
    const up1 = await apiFetch('/documents', { method: 'POST', clinicId: clinicA.id, body: fd1 });
    assert.equal(up1.status, 201);
    assert.equal(up1.data.tax_iva_amount, '10.00');
    assert.equal(up1.data.total_amount, '110.00');

    const fd2 = new FormData();
    fd2.append('file', new Blob([PNG_BYTES], { type: 'image/png' }), 'material.png');
    fd2.append('folder_id', comprasFolderA.id);
    fd2.append('name', 'Compra Guantes');
    fd2.append('bill_type', 'COMPRAS_MATERIAL');
    fd2.append('document_date', '2026-04-10');
    fd2.append('tax_iva_rate', '21');
    fd2.append('total_amount', '121.00');
    const up2 = await apiFetch('/documents', { method: 'POST', clinicId: clinicA.id, body: fd2 });
    assert.equal(up2.status, 201);
    assert.equal(up2.data.base_amount, '100.00');
    assert.equal(up2.data.tax_iva_amount, '21.00');

    const spoofFd = new FormData();
    spoofFd.append('file', new Blob([Buffer.from('not-an-image')], { type: 'image/jpeg' }), 'fake.jpg');
    spoofFd.append('folder_id', aguaFolderA.id);
    spoofFd.append('name', 'Fake');
    spoofFd.append('bill_type', 'AGUA');
    spoofFd.append('document_date', '2026-03-15');
    spoofFd.append('base_amount', '10.00');
    const spoofRes = await apiFetch('/documents', { method: 'POST', clinicId: clinicA.id, body: spoofFd });
    assert.equal(spoofRes.status, 415);

    // 4. Strict multi-clinic isolation: Clinic B cannot see or touch Clinic A's data
    const listB = await apiFetch('/documents', { clinicId: clinicB.id });
    assert.equal(listB.status, 200);
    assert.equal(listB.data.items.length, 0);
    assert.equal((await apiFetch(`/documents/${up1.data.id}`, { clinicId: clinicB.id })).status, 404);
    assert.equal((await apiFetch(`/documents/${up1.data.id}/file`, { clinicId: clinicB.id })).status, 404);
    assert.equal((await apiFetch(`/documents/${up1.data.id}`, { method: 'PATCH', clinicId: clinicB.id, body: { name: 'Hacked' } })).status, 404);
    assert.equal((await apiFetch(`/documents/${up1.data.id}`, { method: 'DELETE', clinicId: clinicB.id })).status, 404);
    assert.equal((await apiFetch(`/folders/${aguaFolderA.id}`, { clinicId: clinicB.id })).status, 404);

    // 5. Patch metadata preserves 10% IVA + file replace + delete cleans disk
    const patchMeta = await apiFetch(`/documents/${up1.data.id}`, {
      method: 'PATCH', clinicId: clinicA.id, body: { name: 'Factura Agua Marzo Editada' },
    });
    assert.equal(patchMeta.status, 200);
    assert.equal(patchMeta.data.name, 'Factura Agua Marzo Editada');
    assert.equal(patchMeta.data.tax_iva_rate, '10.00');

    const [{ file_path: oldRel }] = (await pool.query('SELECT file_path FROM documents WHERE id = $1', [up1.data.id])).rows;
    const fdRep = new FormData();
    fdRep.append('file', new Blob([JPG_BYTES], { type: 'image/jpeg' }), 'agua-marzo.jpg');
    const repRes = await apiFetch(`/documents/${up1.data.id}`, { method: 'PATCH', clinicId: clinicA.id, body: fdRep });
    assert.equal(repRes.status, 200);
    await assert.rejects(fs.stat(path.resolve(STORAGE_ROOT, oldRel)));

    // 6. Workers & Nóminas + Accountant rules
    const wk = await apiFetch('/workers', { method: 'POST', clinicId: clinicA.id, body: { full_name: 'Ana Ruiz' } });
    assert.equal(wk.status, 201);
    assert.equal((await apiFetch(`/workers/${wk.data.id}`, { method: 'PATCH', clinicId: clinicB.id, body: { full_name: 'Ana Hack' } })).status, 404);

    const nomFd = new FormData();
    nomFd.append('file', new Blob([PDF_BYTES], { type: 'application/pdf' }), 'nomina-mayo.pdf');
    nomFd.append('worker_id', wk.data.id);
    nomFd.append('period_year', '2026');
    nomFd.append('period_month', '5');
    nomFd.append('gross_salary', '2000.00');
    nomFd.append('irpf_withholding', '300.00');
    nomFd.append('social_security_worker', '120.00');
    nomFd.append('social_security_company', '600.00');
    const nom = await apiFetch('/nominas', { method: 'POST', clinicId: clinicA.id, body: nomFd });
    assert.equal(nom.status, 201);
    assert.equal(nom.data.net_salary, '1580.00');
    assert.equal(nom.data.total_company_cost, '2600.00');

    // Editing a nómina doc via /documents/:id must be refused (400)
    const editNomViaDoc = await apiFetch(`/documents/${nom.data.document_id}`, {
      method: 'PATCH', clinicId: clinicA.id, body: { name: 'Bypass' },
    });
    assert.equal(editNomViaDoc.status, 400);

    // 7. Accountant Reconciliation: Dashboard === Search === Spend === IVA
    const dash = (await apiFetch('/dashboard?year=2026', { clinicId: clinicA.id })).data;
    const search = (await apiFetch('/documents?from=2026-01-01&to=2026-12-31&limit=500', { clinicId: clinicA.id })).data;
    const spend = (await apiFetch('/reports/spend?year=2026', { clinicId: clinicA.id })).data;
    const ivaRep = (await apiFetch('/reports/iva?year=2026', { clinicId: clinicA.id })).data;

    // 110.00 + 121.00 + 2600.00 = 2831.00 ; IVA = 10.00 + 21.00 + 0.00 = 31.00
    assert.equal(dash.kpis.total_amount, '2831.00');
    assert.equal(dash.kpis.tax_iva_amount, '31.00');
    assert.equal(dash.kpis.nominas_amount, '2600.00');
    assert.equal(search.totals.total_amount, dash.kpis.total_amount);
    assert.equal(search.totals.tax_iva_amount, dash.kpis.tax_iva_amount);
    assert.equal(spend.total.total_amount, dash.kpis.total_amount);
    assert.equal(spend.total.tax_iva_amount, dash.kpis.tax_iva_amount);
    assert.equal(ivaRep.total.tax_iva_amount, dash.kpis.tax_iva_amount);

    // Delete doc removes file from disk
    const [{ file_path: curRel }] = (await pool.query('SELECT file_path FROM documents WHERE id = $1', [up1.data.id])).rows;
    const delRes = await apiFetch(`/documents/${up1.data.id}`, { method: 'DELETE', clinicId: clinicA.id });
    assert.equal(delRes.status, 204);
    await assert.rejects(fs.stat(path.resolve(STORAGE_ROOT, curRel)));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await pool.query('DELETE FROM users WHERE id = $1', [user.id]).catch(() => {});
    for (const cid of createdClinicIds) {
      await fs.rm(path.join(STORAGE_ROOT, `clinic_${cid}`), { recursive: true, force: true }).catch(() => {});
    }
    await pool.end().catch(() => {});
  }
});
