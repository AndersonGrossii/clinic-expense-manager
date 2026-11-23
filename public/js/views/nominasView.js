import { api, revokeBlobUrl } from '../api.js';
import { state, loadWorkers } from '../state.js';
import {
  MONTHS_ES, esc, fmtEur, icons, openModal, confirmDialog, toast,
  toCents, fromCents, triggerBlobDownload,
} from '../ui.js';
import { openFileViewerModal } from '../modals/fileViewerModal.js';

function openWorkerModal({ worker = null, onSaved } = {}) {
  const isEdit = Boolean(worker);
  const modal = openModal({
    title: isEdit ? 'Editar trabajador' : 'Nuevo trabajador',
    body: `
      <form id="worker-form" class="form-grid" novalidate>
        <div id="worker-err" class="form-error full" hidden></div>
        <div class="field full">
          <label for="wk-name">Nombre completo *</label>
          <input id="wk-name" class="input" required maxlength="150"
            value="${esc(worker?.full_name || '')}" placeholder="Ej. Laura Gómez Pérez">
        </div>
        <div class="field">
          <label for="wk-dni">DNI / NIE</label>
          <input id="wk-dni" class="input" maxlength="30"
            value="${esc(worker?.dni_nie || '')}" placeholder="Ej. 12345678A">
        </div>
        <div class="field">
          <label for="wk-role">Puesto / Categoría</label>
          <input id="wk-role" class="input" maxlength="100"
            value="${esc(worker?.role_title || '')}" placeholder="Ej. Higienista dental">
        </div>
        <label class="check full">
          <input id="wk-active" type="checkbox" ${worker?.is_active !== false ? 'checked' : ''}>
          <span>Trabajador activo en la clínica</span>
        </label>
      </form>
    `,
    footer: `
      <button type="button" class="btn" data-modal-close>Cancelar</button>
      <button type="submit" form="worker-form" id="wk-submit" class="btn btn-primary">${isEdit ? 'Guardar' : 'Crear trabajador'}</button>
    `,
  });

  const form = modal.body.querySelector('#worker-form');
  const errBox = modal.body.querySelector('#worker-err');
  const submitBtn = modal.footer.querySelector('#wk-submit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.hidden = true;
    const payload = {
      full_name: modal.body.querySelector('#wk-name').value.trim(),
      dni_nie: modal.body.querySelector('#wk-dni').value.trim(),
      role_title: modal.body.querySelector('#wk-role').value.trim(),
      is_active: modal.body.querySelector('#wk-active').checked,
    };
    submitBtn.disabled = true;
    try {
      const saved = isEdit
        ? await api.patch(`/workers/${worker.id}`, payload)
        : await api.post('/workers', payload);
      toast(isEdit ? 'Trabajador actualizado' : 'Trabajador añadido');
      modal.close();
      if (onSaved) onSaved(saved);
    } catch (err) {
      errBox.textContent = err.message;
      errBox.hidden = false;
    } finally {
      submitBtn.disabled = false;
    }
  });
}

async function openNominaModal({ nomina = null, onSaved } = {}) {
  const isEdit = Boolean(nomina);
  let workers;
  try {
    workers = await loadWorkers(true);
  } catch (err) {
    toast(err.message, 'error');
    return;
  }

  if (!workers.length) {
    toast('Primero crea al menos un trabajador en la clínica.', 'error');
    openWorkerModal({
      onSaved: () => openNominaModal({ nomina, onSaved }),
    });
    return;
  }

  const now = new Date();
  const initialYear = nomina?.period_year || now.getFullYear();
  const initialMonth = nomina?.period_month || now.getMonth() + 1;
  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 3 + i);
  let previewUrl = null;

  const modal = openModal({
    title: isEdit ? 'Editar nómina' : 'Subir nómina de trabajador',
    size: 'wide',
    body: `
      <form id="nomina-form" novalidate>
        <div id="nom-err" class="form-error" hidden></div>
        <div class="upload-layout">
          <div>
            <div class="field">
              <label for="nom-file">${isEdit ? 'Reemplazar archivo (opcional)' : 'Archivo de nómina (PDF o foto) *'}</label>
              <div id="nom-dropzone" class="dropzone" tabindex="0" role="button">
                ${icons.upload}
                <div>Arrastra o <strong>elige la nómina</strong></div>
                <div class="help">PDF, JPG, PNG, WEBP, HEIC · máx. ${esc(state.meta.maxUploadMb)} MB</div>
                <div id="nom-file-name" class="file-name">${isEdit ? `Actual: ${esc(nomina.file_original_name)}` : ''}</div>
              </div>
              <input id="nom-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif" hidden>
            </div>
            <div id="nom-preview" class="upload-preview">
              <span class="muted">Sin vista previa seleccionada</span>
            </div>
            <div class="mt">
              <span class="badge badge-amber">Exenta de IVA (0%) · Se archiva en carpeta Nóminas</span>
            </div>
          </div>

          <div class="form-grid">
            <div class="field full">
              <label for="nom-worker">Trabajador *</label>
              <select id="nom-worker" required>
                ${workers.map((w) => `<option value="${esc(w.id)}" ${w.id === nomina?.worker_id ? 'selected' : ''}>${esc(w.full_name)}${w.role_title ? ` (${esc(w.role_title)})` : ''}${w.is_active ? '' : ' [Inactivo]'}</option>`).join('')}
              </select>
            </div>

            <div class="field">
              <label for="nom-month">Mes *</label>
              <select id="nom-month" required>
                ${MONTHS_ES.map((m, idx) => `<option value="${idx + 1}" ${idx + 1 === initialMonth ? 'selected' : ''}>${esc(m)}</option>`).join('')}
              </select>
            </div>

            <div class="field">
              <label for="nom-year">Año *</label>
              <select id="nom-year" required>
                ${years.map((y) => `<option value="${y}" ${y === initialYear ? 'selected' : ''}>${y}</option>`).join('')}
              </select>
            </div>

            <div class="field">
              <label for="nom-gross">Salario bruto (€) *</label>
              <input id="nom-gross" class="input money" inputmode="decimal" required
                value="${esc(nomina?.gross_salary || '')}" placeholder="0.00">
            </div>

            <div class="field">
              <label for="nom-irpf">Retención IRPF (€)</label>
              <input id="nom-irpf" class="input money" inputmode="decimal"
                value="${esc(nomina?.irpf_withholding || '0.00')}" placeholder="0.00">
            </div>

            <div class="field">
              <label for="nom-ssw">SS Trabajador (€)</label>
              <input id="nom-ssw" class="input money" inputmode="decimal"
                value="${esc(nomina?.social_security_worker || '0.00')}" placeholder="0.00">
            </div>

            <div class="field">
              <label for="nom-ssc">SS Empresa (€)</label>
              <input id="nom-ssc" class="input money" inputmode="decimal"
                value="${esc(nomina?.social_security_company || '0.00')}" placeholder="0.00">
            </div>

            <div class="field full">
              <label for="nom-net">Salario neto a percibir (€)</label>
              <input id="nom-net" class="input money" inputmode="decimal" readonly
                value="${esc(nomina?.net_salary || '0.00')}">
              <span class="help">Calculado automáticamente: Bruto − IRPF − SS Trabajador</span>
            </div>

            <div class="calc-box full">
              <span>Coste total para la clínica (Bruto + SS Empresa):</span>
              <strong id="nom-cost">${esc(fmtEur(nomina?.total_company_cost || 0))}</strong>
            </div>

            <div class="field full">
              <label for="nom-notes">Notas</label>
              <textarea id="nom-notes" maxlength="2000" placeholder="Pagas extras, bajas, observaciones…">${esc(nomina?.notes || '')}</textarea>
            </div>
          </div>
        </div>
      </form>
    `,
    footer: `
      <button type="button" class="btn" data-modal-close>Cancelar</button>
      <button type="submit" form="nomina-form" id="nom-submit" class="btn btn-primary">${isEdit ? 'Guardar cambios' : 'Registrar nómina'}</button>
    `,
    onClose: () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    },
  });

  const form = modal.body.querySelector('#nomina-form');
  const errBox = modal.body.querySelector('#nom-err');
  const fileInput = modal.body.querySelector('#nom-file');
  const dropzone = modal.body.querySelector('#nom-dropzone');
  const fileNameEl = modal.body.querySelector('#nom-file-name');
  const previewEl = modal.body.querySelector('#nom-preview');
  const grossEl = modal.body.querySelector('#nom-gross');
  const irpfEl = modal.body.querySelector('#nom-irpf');
  const sswEl = modal.body.querySelector('#nom-ssw');
  const sscEl = modal.body.querySelector('#nom-ssc');
  const netEl = modal.body.querySelector('#nom-net');
  const costEl = modal.body.querySelector('#nom-cost');
  const submitBtn = modal.footer.querySelector('#nom-submit');

  let selectedFile = null;

  function recalc() {
    const g = toCents(grossEl.value) ?? 0;
    const ir = toCents(irpfEl.value) ?? 0;
    const sw = toCents(sswEl.value) ?? 0;
    const sc = toCents(sscEl.value) ?? 0;
    netEl.value = fromCents(Math.max(0, g - ir - sw));
    costEl.textContent = fmtEur(fromCents(g + sc));
  }

  for (const el of [grossEl, irpfEl, sswEl, sscEl]) el.addEventListener('input', recalc);
  recalc();

  function handleFile(file) {
    if (!file) return;
    selectedFile = file;
    fileNameEl.textContent = file.name;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);

    const lower = file.name.toLowerCase();
    if (file.type === 'application/pdf' || lower.endsWith('.pdf')) {
      const frame = document.createElement('iframe');
      frame.src = previewUrl;
      frame.title = file.name;
      previewEl.innerHTML = '';
      previewEl.appendChild(frame);
    } else if (file.type.startsWith('image/') && !lower.endsWith('.heic') && !lower.endsWith('.heif')) {
      const img = document.createElement('img');
      img.src = previewUrl;
      img.alt = file.name;
      previewEl.innerHTML = '';
      previewEl.appendChild(img);
    } else {
      previewEl.innerHTML = `<span class="muted">Archivo listo: ${esc(file.name)}</span>`;
    }
  }

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.hidden = true;
    if (!isEdit && !selectedFile) {
      errBox.textContent = 'Adjunta el archivo PDF o foto de la nómina.';
      errBox.hidden = false;
      return;
    }

    const fields = {
      worker_id: modal.body.querySelector('#nom-worker').value,
      period_year: modal.body.querySelector('#nom-year').value,
      period_month: modal.body.querySelector('#nom-month').value,
      gross_salary: grossEl.value.trim(),
      irpf_withholding: irpfEl.value.trim() || '0.00',
      social_security_worker: sswEl.value.trim() || '0.00',
      social_security_company: sscEl.value.trim() || '0.00',
      net_salary: netEl.value.trim(),
      notes: modal.body.querySelector('#nom-notes').value.trim(),
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando…';
    try {
      let saved;
      if (isEdit && !selectedFile) {
        saved = await api.patch(`/nominas/${nomina.id}`, fields);
      } else {
        const fd = new FormData();
        if (selectedFile) fd.append('file', selectedFile);
        for (const [k, v] of Object.entries(fields)) fd.append(k, v);
        saved = isEdit
          ? await api.patch(`/nominas/${nomina.id}`, fd)
          : await api.post('/nominas', fd);
      }
      toast(isEdit ? 'Nómina actualizada' : 'Nómina registrada');
      modal.close();
      if (onSaved) onSaved(saved);
    } catch (err) {
      errBox.textContent = err.message;
      errBox.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? 'Guardar cambios' : 'Registrar nómina';
    }
  });
}

export async function renderNominasView(container, params = {}) {
  let activeTab = params.tab === 'workers' ? 'workers' : 'nominas';
  let filterYear = String(new Date().getFullYear());
  let filterWorker = '';

  const now = new Date();
  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 3 + i).reverse();

  async function render() {
    container.innerHTML = '<div class="spinner"></div>';
    const workers = await loadWorkers(true);
    if (!document.body.contains(container)) return;

    container.innerHTML = `
      <div class="page-head">
        <div>
          <h2>Nóminas y trabajadores</h2>
          <p>Gestiona la plantilla de esta clínica y sube las nóminas mensuales (sin IVA).</p>
        </div>
        <div class="row">
          <div class="seg" id="nom-tabs">
            <button type="button" data-tab="nominas" class="${activeTab === 'nominas' ? 'active' : ''}">Nóminas</button>
            <button type="button" data-tab="workers" class="${activeTab === 'workers' ? 'active' : ''}">Trabajadores (${workers.length})</button>
          </div>
          <button type="button" id="add-worker-btn" class="btn">${icons.plus}<span>Nuevo trabajador</span></button>
          <button type="button" id="add-nomina-btn" class="btn btn-primary">${icons.upload}<span>Subir nómina</span></button>
        </div>
      </div>
      <div id="nom-stage"></div>
    `;

    for (const b of container.querySelectorAll('#nom-tabs button')) {
      b.addEventListener('click', () => { activeTab = b.dataset.tab; render(); });
    }
    container.querySelector('#add-worker-btn').addEventListener('click', () => openWorkerModal({ onSaved: render }));
    container.querySelector('#add-nomina-btn').addEventListener('click', () => openNominaModal({ onSaved: render }));

    const stage = container.querySelector('#nom-stage');

    if (activeTab === 'workers') {
      if (!workers.length) {
        stage.innerHTML = `<div class="card empty">${icons.users}<p>No hay trabajadores dados de alta en esta clínica.</p></div>`;
        return;
      }
      const wMap = new Map(workers.map((w) => [w.id, w]));
      stage.innerHTML = `
        <div class="card table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Trabajador</th><th>DNI / NIE</th><th>Puesto</th><th>Estado</th>
                <th class="num">Nóminas</th><th class="num">Coste acumulado</th><th class="actions">Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${workers.map((w) => `
                <tr>
                  <td><strong>${esc(w.full_name)}</strong></td>
                  <td class="mono">${esc(w.dni_nie || '—')}</td>
                  <td>${esc(w.role_title || '—')}</td>
                  <td>${w.is_active ? '<span class="badge badge-green">Activo</span>' : '<span class="badge">Inactivo</span>'}</td>
                  <td class="num">${w.nomina_count}</td>
                  <td class="num"><strong>${esc(fmtEur(w.total_company_cost))}</strong></td>
                  <td class="actions">
                    <button type="button" class="btn btn-ghost btn-icon btn-sm" data-edit-w="${esc(w.id)}" title="Editar">${icons.edit}</button>
                    <button type="button" class="btn btn-ghost btn-icon btn-sm" data-del-w="${esc(w.id)}" title="Eliminar">${icons.trash}</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      for (const b of stage.querySelectorAll('[data-edit-w]')) {
        b.addEventListener('click', () => openWorkerModal({ worker: wMap.get(b.dataset.editW), onSaved: render }));
      }
      for (const b of stage.querySelectorAll('[data-del-w]')) {
        b.addEventListener('click', async () => {
          const w = wMap.get(b.dataset.delW);
          const ok = await confirmDialog({
            title: 'Eliminar trabajador',
            message: `¿Eliminar a ${w.full_name}? (Solo es posible si no tiene nóminas registradas).`,
            confirmLabel: 'Eliminar',
            danger: true,
          });
          if (!ok) return;
          try {
            await api.del(`/workers/${w.id}`);
            toast('Trabajador eliminado');
            render();
          } catch (err) { toast(err.message, 'error'); }
        });
      }
      return;
    }

    // ── Nóminas tab ─────────────────────────────────────────────────
    const qs = new URLSearchParams();
    if (filterYear) qs.set('year', filterYear);
    if (filterWorker) qs.set('workerId', filterWorker);
    const data = await api.get(`/nominas?${qs.toString()}`);
    if (!document.body.contains(container)) return;

    const { items, totals } = data;
    const nMap = new Map(items.map((n) => [n.id, n]));

    stage.innerHTML = `
      <div class="card card-pad">
        <div class="row">
          <div class="field">
            <label for="nom-f-year">Año</label>
            <select id="nom-f-year">
              <option value="">Todos los años</option>
              ${years.map((y) => `<option value="${y}" ${String(y) === filterYear ? 'selected' : ''}>${y}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="nom-f-worker">Trabajador</label>
            <select id="nom-f-worker">
              <option value="">Todos los trabajadores</option>
              ${workers.map((w) => `<option value="${esc(w.id)}" ${w.id === filterWorker ? 'selected' : ''}>${esc(w.full_name)}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <div class="totals-bar mt">
        <div><span>Nóminas</span><strong>${totals.count}</strong></div>
        <div><span>Salario bruto</span><strong>${esc(fmtEur(totals.gross_salary))}</strong></div>
        <div><span>IRPF</span><strong>${esc(fmtEur(totals.irpf_withholding))}</strong></div>
        <div><span>SS Empresa</span><strong>${esc(fmtEur(totals.social_security_company))}</strong></div>
        <div><span>Neto pagado</span><strong>${esc(fmtEur(totals.net_salary))}</strong></div>
        <div><span>Coste clínica</span><strong>${esc(fmtEur(totals.total_company_cost))}</strong></div>
      </div>

      <div class="card table-wrap">
        ${!items.length
          ? `<div class="empty">${icons.users}<p>No hay nóminas registradas para este filtro.</p></div>`
          : `
            <table class="table">
              <thead>
                <tr>
                  <th>Periodo</th><th>Trabajador</th>
                  <th class="num">Bruto</th><th class="num">IRPF</th>
                  <th class="num">SS Trab.</th><th class="num">SS Emp.</th>
                  <th class="num">Neto</th><th class="num">Coste clínica</th>
                  <th class="actions">Acciones</th>
                </tr>
              </thead>
              <tbody>
                ${items.map((n) => `
                  <tr>
                    <td class="nowrap"><strong>${esc(MONTHS_ES[n.period_month - 1])} ${n.period_year}</strong></td>
                    <td>
                      <div class="doc-name">${esc(n.worker_name)}</div>
                      ${n.worker_role ? `<div class="sub">${esc(n.worker_role)}</div>` : ''}
                    </td>
                    <td class="num">${esc(fmtEur(n.gross_salary))}</td>
                    <td class="num">${esc(fmtEur(n.irpf_withholding))}</td>
                    <td class="num">${esc(fmtEur(n.social_security_worker))}</td>
                    <td class="num">${esc(fmtEur(n.social_security_company))}</td>
                    <td class="num">${esc(fmtEur(n.net_salary))}</td>
                    <td class="num"><strong>${esc(fmtEur(n.total_company_cost))}</strong></td>
                    <td class="actions">
                      <button type="button" class="btn btn-ghost btn-icon btn-sm" data-view-n="${esc(n.id)}" title="Ver archivo">${icons.eye}</button>
                      <button type="button" class="btn btn-ghost btn-icon btn-sm" data-dl-n="${esc(n.id)}" title="Descargar">${icons.download}</button>
                      <button type="button" class="btn btn-ghost btn-icon btn-sm" data-edit-n="${esc(n.id)}" title="Editar">${icons.edit}</button>
                      <button type="button" class="btn btn-ghost btn-icon btn-sm" data-del-n="${esc(n.id)}" title="Eliminar">${icons.trash}</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
      </div>
    `;

    stage.querySelector('#nom-f-year').addEventListener('change', (e) => { filterYear = e.target.value; render(); });
    stage.querySelector('#nom-f-worker').addEventListener('change', (e) => { filterWorker = e.target.value; render(); });

    for (const b of stage.querySelectorAll('[data-view-n]')) {
      b.addEventListener('click', async () => {
        const n = nMap.get(b.dataset.viewN);
        try {
          const doc = await api.get(`/documents/${n.document_id}`);
          openFileViewerModal(doc);
        } catch (err) { toast(err.message, 'error'); }
      });
    }
    for (const b of stage.querySelectorAll('[data-dl-n]')) {
      b.addEventListener('click', async () => {
        const n = nMap.get(b.dataset.dlN);
        try {
          const { blob, url } = await api.fetchFileBlob(n.document_id, { download: true });
          triggerBlobDownload(blob, n.file_original_name);
          revokeBlobUrl(url);
        } catch (err) { toast(err.message, 'error'); }
      });
    }
    for (const b of stage.querySelectorAll('[data-edit-n]')) {
      b.addEventListener('click', () => openNominaModal({ nomina: nMap.get(b.dataset.editN), onSaved: render }));
    }
    for (const b of stage.querySelectorAll('[data-del-n]')) {
      b.addEventListener('click', async () => {
        const n = nMap.get(b.dataset.delN);
        const ok = await confirmDialog({
          title: 'Eliminar nómina',
          message: `¿Eliminar la nómina de ${n.worker_name} (${MONTHS_ES[n.period_month - 1]} ${n.period_year})? Se eliminará también su documento adjunto.`,
          confirmLabel: 'Eliminar',
          danger: true,
        });
        if (!ok) return;
        try {
          await api.del(`/nominas/${n.id}`);
          toast('Nómina eliminada');
          render();
        } catch (err) { toast(err.message, 'error'); }
      });
    }
  }

  await render();
}
