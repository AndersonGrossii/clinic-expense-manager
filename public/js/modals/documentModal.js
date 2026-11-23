import { api } from '../api.js';
import { state, loadFolders } from '../state.js';
import { esc, icons, openModal, toast, fmtEur, toCents, fromCents, ivaFromBaseCents } from '../ui.js';

export async function openDocumentModal({ doc = null, defaultFolderId = null, onSaved } = {}) {
  const isEdit = Boolean(doc);
  if (isEdit && doc.bill_type === 'NOMINA') {
    toast('Las nóminas se editan desde la sección Nóminas', 'error');
    return;
  }

  let folders;
  try {
    folders = await loadFolders(true);
  } catch (err) {
    toast(err.message, 'error');
    return;
  }

  const usableFolders = folders.filter((f) => !f.is_system_payroll);
  const chosenFolderId = doc?.folder_id
    || (usableFolders.some((f) => f.id === defaultFolderId) ? defaultFolderId : usableFolders[0]?.id)
    || '';
  const chosenFolder = usableFolders.find((f) => f.id === chosenFolderId);
  const billTypes = state.meta.billTypes.filter((t) => t.code !== 'NOMINA');
  const initialType = doc?.bill_type || chosenFolder?.default_bill_type || 'GASTOS_GENERALES';
  const today = new Date().toISOString().slice(0, 10);
  const initialRate = doc ? Number(doc.tax_iva_rate) : 21;

  let previewUrl = null;

  const modal = openModal({
    title: isEdit ? 'Editar documento' : 'Subir recibo o factura',
    size: 'wide',
    body: `
      <form id="doc-form" novalidate>
        <div id="doc-error" class="form-error" hidden></div>
        <div class="upload-layout">
          <div>
            <div class="field">
              <label for="doc-file">${isEdit ? 'Reemplazar archivo (opcional)' : 'Archivo (Foto o PDF) *'}</label>
              <div id="doc-dropzone" class="dropzone" tabindex="0" role="button">
                ${icons.upload}
                <div>Arrastra aquí una foto o PDF, o <strong>haz clic para elegir</strong></div>
                <div class="help">PDF, JPG, PNG, WEBP, HEIC · máx. ${esc(state.meta.maxUploadMb)} MB</div>
                <div id="doc-file-name" class="file-name">${isEdit ? `Actual: ${esc(doc.file_original_name)}` : ''}</div>
              </div>
              <input id="doc-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif" hidden>
            </div>
            <div id="doc-preview" class="upload-preview">
              <span class="muted">Sin vista previa seleccionada</span>
            </div>
          </div>

          <div class="form-grid">
            <div class="field full">
              <label for="doc-name">Nombre / Concepto *</label>
              <input id="doc-name" name="name" class="input" required maxlength="255"
                value="${esc(doc?.name || '')}" placeholder="Ej. Factura Agua Octubre">
            </div>

            <div class="field">
              <label for="doc-folder">Carpeta *</label>
              <select id="doc-folder" name="folder_id" required>
                ${usableFolders.map((f) => `<option value="${esc(f.id)}" ${f.id === chosenFolderId ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}
              </select>
            </div>

            <div class="field">
              <label for="doc-type">Tipo de factura / gasto *</label>
              <select id="doc-type" name="bill_type" required>
                ${billTypes.map((t) => `<option value="${esc(t.code)}" ${t.code === initialType ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
              </select>
              <span class="help">Para nóminas de empleados usa la pestaña Nóminas.</span>
            </div>

            <div class="field">
              <label for="doc-date">Fecha del documento *</label>
              <input id="doc-date" name="document_date" type="date" class="input" required
                value="${esc(doc?.document_date || today)}">
            </div>

            <div class="field">
              <label for="doc-rate">Tipo de IVA (%) *</label>
              <select id="doc-rate" name="tax_iva_rate">
                ${state.meta.ivaRates.map((r) => `<option value="${r}" ${r === initialRate ? 'selected' : ''}>${r}%</option>`).join('')}
              </select>
            </div>

            <div class="field">
              <label for="doc-vendor">Proveedor / Emisor</label>
              <input id="doc-vendor" name="vendor_name" class="input" maxlength="200"
                value="${esc(doc?.vendor_name || '')}" placeholder="Ej. Canal de Isabel II">
            </div>

            <div class="field">
              <label for="doc-invnum">Nº de factura</label>
              <input id="doc-invnum" name="invoice_number" class="input" maxlength="100"
                value="${esc(doc?.invoice_number || '')}" placeholder="Ej. F-2026-0041">
            </div>

            <div class="field">
              <label for="doc-base">Base imponible (€) *</label>
              <input id="doc-base" name="base_amount" class="input money" inputmode="decimal"
                value="${esc(doc?.base_amount || '')}" placeholder="0.00">
            </div>

            <div class="field">
              <label for="doc-iva">Cuota IVA (€)</label>
              <input id="doc-iva" name="tax_iva_amount" class="input money" inputmode="decimal"
                value="${esc(doc?.tax_iva_amount || '')}" placeholder="0.00">
            </div>

            <div class="field full">
              <label for="doc-total">Total pagado (€) *</label>
              <input id="doc-total" name="total_amount" class="input money" inputmode="decimal"
                value="${esc(doc?.total_amount || '')}" placeholder="0.00">
            </div>

            <div class="calc-box full">
              <span>Resumen contable:</span>
              <strong id="doc-calc-summary">${esc(fmtEur(doc?.total_amount || 0))}</strong>
            </div>

            <div class="field full">
              <label for="doc-notes">Notas</label>
              <textarea id="doc-notes" name="notes" maxlength="2000" placeholder="Observaciones opcionales">${esc(doc?.notes || '')}</textarea>
            </div>
          </div>
        </div>
      </form>
    `,
    footer: `
      <button type="button" class="btn" data-modal-close>Cancelar</button>
      <button type="submit" form="doc-form" id="doc-submit" class="btn btn-primary">
        ${isEdit ? 'Guardar cambios' : 'Subir documento'}
      </button>
    `,
    onClose: () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    },
  });

  const form = modal.body.querySelector('#doc-form');
  const errBox = modal.body.querySelector('#doc-error');
  const fileInput = modal.body.querySelector('#doc-file');
  const dropzone = modal.body.querySelector('#doc-dropzone');
  const fileNameEl = modal.body.querySelector('#doc-file-name');
  const previewEl = modal.body.querySelector('#doc-preview');
  const folderSel = modal.body.querySelector('#doc-folder');
  const typeSel = modal.body.querySelector('#doc-type');
  const rateSel = modal.body.querySelector('#doc-rate');
  const baseEl = modal.body.querySelector('#doc-base');
  const ivaEl = modal.body.querySelector('#doc-iva');
  const totalEl = modal.body.querySelector('#doc-total');
  const summaryEl = modal.body.querySelector('#doc-calc-summary');
  const submitBtn = modal.footer.querySelector('#doc-submit');

  let selectedFile = null;
  let userTouchedType = isEdit;

  // Auto-select default bill type when switching folder during creation
  typeSel.addEventListener('change', () => { userTouchedType = true; });
  folderSel.addEventListener('change', () => {
    if (userTouchedType) return;
    const f = usableFolders.find((x) => x.id === folderSel.value);
    if (f?.default_bill_type && f.default_bill_type !== 'NOMINA') typeSel.value = f.default_bill_type;
  });

  // ── Bidirectional IVA calculation in integer cents ──────────────────
  function updateSummary() {
    const t = toCents(totalEl.value);
    const b = toCents(baseEl.value);
    const iv = toCents(ivaEl.value);
    if (t !== null) {
      summaryEl.textContent = `${fmtEur(fromCents(b ?? 0))} + IVA ${fmtEur(fromCents(iv ?? 0))} = ${fmtEur(fromCents(t))}`;
    } else {
      summaryEl.textContent = '0,00 €';
    }
  }

  function recalcFromBase() {
    const b = toCents(baseEl.value);
    if (b === null) { updateSummary(); return; }
    const iv = ivaFromBaseCents(b, Number(rateSel.value));
    ivaEl.value = fromCents(iv);
    totalEl.value = fromCents(b + iv);
    updateSummary();
  }

  function recalcFromTotal() {
    const t = toCents(totalEl.value);
    if (t === null) { updateSummary(); return; }
    const rh = Math.round(Number(rateSel.value) * 100);
    const b = Math.round((t * 10000) / (10000 + rh));
    const iv = t - b;
    baseEl.value = fromCents(b);
    ivaEl.value = fromCents(iv);
    updateSummary();
  }

  function recalcFromIva() {
    const b = toCents(baseEl.value);
    const iv = toCents(ivaEl.value);
    if (b !== null && iv !== null) {
      totalEl.value = fromCents(b + iv);
    }
    updateSummary();
  }

  baseEl.addEventListener('input', recalcFromBase);
  rateSel.addEventListener('change', () => {
    if (baseEl.value.trim()) recalcFromBase();
    else if (totalEl.value.trim()) recalcFromTotal();
  });
  totalEl.addEventListener('input', recalcFromTotal);
  ivaEl.addEventListener('input', recalcFromIva);
  updateSummary();

  // ── File dropzone & local preview ───────────────────────────────────
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

  // ── Submit ──────────────────────────────────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.hidden = true;

    if (!isEdit && !selectedFile) {
      errBox.textContent = 'Adjunta una foto o PDF del recibo/factura.';
      errBox.hidden = false;
      return;
    }

    const fields = {
      folder_id: folderSel.value,
      name: form.name.value.trim(),
      vendor_name: form.vendor_name.value.trim(),
      invoice_number: form.invoice_number.value.trim(),
      bill_type: typeSel.value,
      document_date: form.document_date.value,
      tax_iva_rate: rateSel.value,
      base_amount: baseEl.value.trim(),
      tax_iva_amount: ivaEl.value.trim(),
      total_amount: totalEl.value.trim(),
      notes: form.notes.value.trim(),
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando…';

    try {
      let saved;
      if (isEdit && !selectedFile) {
        saved = await api.patch(`/documents/${doc.id}`, fields);
      } else {
        const fd = new FormData();
        if (selectedFile) fd.append('file', selectedFile);
        for (const [k, v] of Object.entries(fields)) fd.append(k, v);
        saved = isEdit
          ? await api.patch(`/documents/${doc.id}`, fd)
          : await api.post('/documents', fd);
      }

      toast(isEdit ? 'Documento actualizado' : 'Documento subido correctamente');
      modal.close();
      if (onSaved) onSaved(saved);
    } catch (err) {
      errBox.textContent = err.message;
      errBox.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? 'Guardar cambios' : 'Subir documento';
    }
  });
}
