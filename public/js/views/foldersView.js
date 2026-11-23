import { api, revokeBlobUrl } from '../api.js';
import { state, loadFolders, billTypeLabel, navigate } from '../state.js';
import { CLINIC_COLORS, esc, fmtEur, fmtDate, icons, openModal, confirmDialog, toast, triggerBlobDownload } from '../ui.js';
import { openDocumentModal } from '../modals/documentModal.js';
import { openFileViewerModal } from '../modals/fileViewerModal.js';

function openFolderModal({ folder = null, onSaved } = {}) {
  const isEdit = Boolean(folder);
  const selectedColor = folder?.color || CLINIC_COLORS[0];
  const billTypes = state.meta.billTypes.filter((t) => t.code !== 'NOMINA');

  const modal = openModal({
    title: isEdit ? 'Editar carpeta' : 'Nueva carpeta',
    body: `
      <form id="folder-form" class="form-grid" novalidate>
        <div id="folder-err" class="form-error full" hidden></div>
        <div class="field full">
          <label for="fl-name">Nombre de la carpeta *</label>
          <input id="fl-name" class="input" required maxlength="120"
            value="${esc(folder?.name || '')}" placeholder="Ej. Laboratorio Prótesis, Seguros…">
        </div>
        ${folder?.is_system_payroll ? '' : `
          <div class="field full">
            <label for="fl-type">Tipo de factura por defecto (opcional)</label>
            <select id="fl-type">
              <option value="">— Sin tipo predeterminado —</option>
              ${billTypes.map((t) => `<option value="${esc(t.code)}" ${t.code === folder?.default_bill_type ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
            </select>
          </div>
        `}
        <div class="field full">
          <label>Color</label>
          <input id="fl-color" type="hidden" value="${esc(selectedColor)}">
          <div class="row">
            ${CLINIC_COLORS.map((c) => `
              <button type="button" class="btn btn-sm ${c === selectedColor ? 'btn-primary' : ''}" data-color="${esc(c)}" aria-label="Color ${esc(c)}">
                <span class="badge"><span class="dot"></span></span>
              </button>
            `).join('')}
          </div>
        </div>
      </form>
    `,
    footer: `
      <button type="button" class="btn" data-modal-close>Cancelar</button>
      <button type="submit" form="folder-form" id="fl-submit" class="btn btn-primary">${isEdit ? 'Guardar' : 'Crear carpeta'}</button>
    `,
  });

  const form = modal.body.querySelector('#folder-form');
  const errBox = modal.body.querySelector('#folder-err');
  const colorInput = modal.body.querySelector('#fl-color');
  const submitBtn = modal.footer.querySelector('#fl-submit');

  for (const btn of modal.body.querySelectorAll('[data-color]')) {
    btn.querySelector('.dot').style.backgroundColor = btn.dataset.color;
    btn.addEventListener('click', () => {
      colorInput.value = btn.dataset.color;
      for (const b of modal.body.querySelectorAll('[data-color]')) b.classList.remove('btn-primary');
      btn.classList.add('btn-primary');
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.hidden = true;
    const typeEl = modal.body.querySelector('#fl-type');
    const payload = {
      name: modal.body.querySelector('#fl-name').value.trim(),
      color: colorInput.value,
      ...(typeEl ? { default_bill_type: typeEl.value || null } : {}),
    };

    submitBtn.disabled = true;
    try {
      const saved = isEdit
        ? await api.patch(`/folders/${folder.id}`, payload)
        : await api.post('/folders', payload);
      toast(isEdit ? 'Carpeta actualizada' : 'Carpeta creada');
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

async function renderFolderGrid(container) {
  container.innerHTML = '<div class="spinner"></div>';
  const folders = await loadFolders(true);
  if (!document.body.contains(container)) return;

  container.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Carpetas de la clínica</h2>
        <p>Organiza recibos, fotos de tickets, facturas de suministros, compras y nóminas en carpetas independientes.</p>
      </div>
      <button id="new-folder-btn" type="button" class="btn btn-primary">${icons.plus}<span>Nueva carpeta</span></button>
    </div>

    <div class="folder-grid" id="folder-grid">
      ${folders.map((f) => `
        <article class="card folder-card" data-folder-id="${esc(f.id)}" data-color="${esc(f.color)}" tabindex="0" role="button">
          <div class="row">
            <div class="icon">${icons.folder}</div>
            <div class="spacer"></div>
            <button type="button" class="btn btn-ghost btn-icon btn-sm" data-edit-folder="${esc(f.id)}" title="Editar carpeta" aria-label="Editar carpeta">${icons.edit}</button>
            ${f.is_system_payroll ? '' : `<button type="button" class="btn btn-ghost btn-icon btn-sm" data-del-folder="${esc(f.id)}" title="Eliminar carpeta" aria-label="Eliminar carpeta">${icons.trash}</button>`}
          </div>
          <h4>${esc(f.name)}</h4>
          <div>
            ${f.is_system_payroll ? '<span class="badge badge-amber">Sistema · Nóminas</span>' : (f.default_bill_type ? `<span class="badge">${esc(billTypeLabel(f.default_bill_type))}</span>` : '<span class="badge">Personalizada</span>')}
          </div>
          <div class="stats">
            <span>${f.document_count} documento(s)</span>
            <strong>${esc(fmtEur(f.total_amount))}</strong>
          </div>
        </article>
      `).join('')}

      <button type="button" id="add-folder-card" class="card folder-card add">
        ${icons.plus}
        <strong>Crear nueva carpeta</strong>
      </button>
    </div>
  `;

  for (const card of container.querySelectorAll('.folder-card[data-folder-id]')) {
    card.style.setProperty('--folder-color', card.dataset.color || '#2563EB');
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      navigate('folders', { id: card.dataset.folderId });
    });
    card.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('button')) {
        e.preventDefault();
        navigate('folders', { id: card.dataset.folderId });
      }
    });
  }

  const folderMap = new Map(folders.map((f) => [f.id, f]));
  const openCreate = () => openFolderModal({ onSaved: () => renderFolderGrid(container) });
  container.querySelector('#new-folder-btn').addEventListener('click', openCreate);
  container.querySelector('#add-folder-card').addEventListener('click', openCreate);

  for (const btn of container.querySelectorAll('[data-edit-folder]')) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openFolderModal({ folder: folderMap.get(btn.dataset.editFolder), onSaved: () => renderFolderGrid(container) });
    });
  }

  for (const btn of container.querySelectorAll('[data-del-folder]')) {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const folder = folderMap.get(btn.dataset.delFolder);
      const ok = await confirmDialog({
        title: 'Eliminar carpeta',
        message: `¿Seguro que deseas eliminar la carpeta "${folder.name}"? (Solo es posible si está vacía).`,
        confirmLabel: 'Eliminar',
        danger: true,
      });
      if (!ok) return;
      try {
        await api.del(`/folders/${folder.id}`);
        toast('Carpeta eliminada');
        renderFolderGrid(container);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }
}

async function renderFolderDetail(container, folderId) {
  let viewMode = 'table'; // 'table' | 'gallery'
  const thumbUrls = [];
  const clearThumbs = () => {
    while (thumbUrls.length) revokeBlobUrl(thumbUrls.pop());
  };

  async function load() {
    clearThumbs();
    container.innerHTML = '<div class="spinner"></div>';
    const [folder, docsRes] = await Promise.all([
      api.get(`/folders/${folderId}`),
      api.get(`/documents?folderId=${encodeURIComponent(folderId)}&limit=200`),
    ]);
    if (!document.body.contains(container)) return;

    const docs = docsRes.items;
    const { totals } = docsRes;

    container.innerHTML = `
      <div class="page-head">
        <div class="row">
          <button type="button" id="back-folders" class="btn">${icons.back}<span>Carpetas</span></button>
          <div>
            <h2>${esc(folder.name)}</h2>
            <p>${docsRes.pagination.total} documento(s) en esta carpeta</p>
          </div>
        </div>
        <div class="row">
          <div class="seg" id="folder-view-mode">
            <button type="button" data-view="table" class="${viewMode === 'table' ? 'active' : ''}">Tabla</button>
            <button type="button" data-view="gallery" class="${viewMode === 'gallery' ? 'active' : ''}">Galería</button>
          </div>
          ${folder.is_system_payroll
            ? `<button type="button" id="go-nominas-btn" class="btn btn-primary">${icons.users}<span>Subir en Nóminas</span></button>`
            : `<button type="button" id="upload-here-btn" class="btn btn-primary">${icons.upload}<span>Subir foto / PDF aquí</span></button>`}
        </div>
      </div>

      <div class="totals-bar">
        <div><span>Documentos</span><strong>${docsRes.pagination.total}</strong></div>
        <div><span>Base imponible</span><strong>${esc(fmtEur(totals.base_amount))}</strong></div>
        <div><span>IVA pagado</span><strong>${esc(fmtEur(totals.tax_iva_amount))}</strong></div>
        <div><span>Total carpeta</span><strong>${esc(fmtEur(totals.total_amount))}</strong></div>
      </div>

      <div id="folder-docs-stage"></div>
    `;

    container.querySelector('#back-folders').addEventListener('click', () => {
      clearThumbs();
      navigate('folders');
    });

    const uploadBtn = container.querySelector('#upload-here-btn');
    if (uploadBtn) {
      uploadBtn.addEventListener('click', () => openDocumentModal({ defaultFolderId: folderId, onSaved: load }));
    }
    const goNominasBtn = container.querySelector('#go-nominas-btn');
    if (goNominasBtn) {
      goNominasBtn.addEventListener('click', () => { clearThumbs(); navigate('nominas'); });
    }

    for (const b of container.querySelectorAll('#folder-view-mode button')) {
      b.addEventListener('click', () => {
        viewMode = b.dataset.view;
        for (const x of container.querySelectorAll('#folder-view-mode button')) x.classList.toggle('active', x === b);
        renderItems();
      });
    }

    const docMap = new Map(docs.map((d) => [d.id, d]));

    async function handleDownload(doc) {
      try {
        const { blob, url } = await api.fetchFileBlob(doc.id, { download: true });
        triggerBlobDownload(blob, doc.file_original_name);
        revokeBlobUrl(url);
      } catch (err) {
        toast(err.message, 'error');
      }
    }

    async function handleDelete(doc) {
      const ok = await confirmDialog({
        title: 'Eliminar documento',
        message: `¿Eliminar "${doc.name}" (${fmtEur(doc.total_amount)})? Se borrará tanto el registro como el archivo adjunto.`,
        confirmLabel: 'Eliminar',
        danger: true,
      });
      if (!ok) return;
      try {
        await api.del(`/documents/${doc.id}`);
        toast('Documento eliminado');
        await load();
      } catch (err) {
        toast(err.message, 'error');
      }
    }

    function openDoc(doc) {
      openFileViewerModal(doc, {
        onEdit: doc.bill_type === 'NOMINA' ? null : (d) => openDocumentModal({ doc: d, onSaved: load }),
      });
    }

    function renderItems() {
      clearThumbs();
      const stage = container.querySelector('#folder-docs-stage');
      if (!docs.length) {
        stage.innerHTML = `<div class="card empty">${icons.folder}<p>Esta carpeta está vacía. Sube el primer recibo o PDF.</p></div>`;
        return;
      }

      if (viewMode === 'gallery') {
        stage.innerHTML = `
          <div class="gallery">
            ${docs.map((d) => `
              <article class="card thumb" data-doc="${esc(d.id)}" tabindex="0" role="button">
                <div class="preview" data-preview="${esc(d.id)}">
                  ${d.file_mime_type === 'application/pdf' ? icons.pdf : icons.image}
                </div>
                <div class="info">
                  <strong title="${esc(d.name)}">${esc(d.name)}</strong>
                  <span>${esc(fmtDate(d.document_date))} · <b>${esc(fmtEur(d.total_amount))}</b></span>
                  <div class="row mt">
                    ${d.bill_type === 'NOMINA' ? '' : `<button type="button" class="btn btn-ghost btn-icon btn-sm" data-edit="${esc(d.id)}" title="Editar">${icons.edit}</button>`}
                    <button type="button" class="btn btn-ghost btn-icon btn-sm" data-dl="${esc(d.id)}" title="Descargar">${icons.download}</button>
                    <button type="button" class="btn btn-ghost btn-icon btn-sm" data-del="${esc(d.id)}" title="Eliminar">${icons.trash}</button>
                  </div>
                </div>
              </article>
            `).join('')}
          </div>
        `;

        // Lazy-load authenticated thumbnails for previewable images
        for (const d of docs) {
          if (d.file_mime_type.startsWith('image/') && !d.file_mime_type.includes('heic') && !d.file_mime_type.includes('heif')) {
            api.fetchFileBlob(d.id).then(({ url }) => {
              const box = stage.querySelector(`[data-preview="${d.id}"]`);
              if (!box || !document.body.contains(stage)) {
                revokeBlobUrl(url);
                return;
              }
              thumbUrls.push(url);
              const img = document.createElement('img');
              img.src = url;
              img.alt = d.name;
              box.innerHTML = '';
              box.appendChild(img);
            }).catch(() => {});
          }
        }

        for (const card of stage.querySelectorAll('.thumb[data-doc]')) {
          card.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            openDoc(docMap.get(card.dataset.doc));
          });
        }
      } else {
        stage.innerHTML = `
          <div class="card table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Fecha</th><th>Documento</th><th>Tipo</th>
                  <th class="num">Base</th><th class="num">IVA</th><th class="num">Total</th>
                  <th class="actions">Acciones</th>
                </tr>
              </thead>
              <tbody>
                ${docs.map((d) => `
                  <tr>
                    <td class="nowrap">${esc(fmtDate(d.document_date))}</td>
                    <td>
                      <div class="doc-name">${esc(d.name)}</div>
                      <div class="sub">${esc(d.vendor_name || d.file_original_name)}</div>
                    </td>
                    <td><span class="badge">${esc(billTypeLabel(d.bill_type))}</span></td>
                    <td class="num">${esc(fmtEur(d.base_amount))}</td>
                    <td class="num">${esc(fmtEur(d.tax_iva_amount))} <span class="muted">(${esc(d.tax_iva_rate)}%)</span></td>
                    <td class="num"><strong>${esc(fmtEur(d.total_amount))}</strong></td>
                    <td class="actions">
                      <button type="button" class="btn btn-ghost btn-icon btn-sm" data-view="${esc(d.id)}" title="Ver archivo">${icons.eye}</button>
                      <button type="button" class="btn btn-ghost btn-icon btn-sm" data-dl="${esc(d.id)}" title="Descargar">${icons.download}</button>
                      ${d.bill_type === 'NOMINA' ? '' : `<button type="button" class="btn btn-ghost btn-icon btn-sm" data-edit="${esc(d.id)}" title="Editar">${icons.edit}</button>`}
                      <button type="button" class="btn btn-ghost btn-icon btn-sm" data-del="${esc(d.id)}" title="Eliminar">${icons.trash}</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }

      for (const b of stage.querySelectorAll('[data-view]')) b.addEventListener('click', () => openDoc(docMap.get(b.dataset.view)));
      for (const b of stage.querySelectorAll('[data-dl]')) b.addEventListener('click', () => handleDownload(docMap.get(b.dataset.dl)));
      for (const b of stage.querySelectorAll('[data-edit]')) {
        b.addEventListener('click', () => openDocumentModal({ doc: docMap.get(b.dataset.edit), onSaved: load }));
      }
      for (const b of stage.querySelectorAll('[data-del]')) b.addEventListener('click', () => handleDelete(docMap.get(b.dataset.del)));
    }

    renderItems();
  }

  await load();
}

export async function renderFoldersView(container, params = {}) {
  if (params.id) await renderFolderDetail(container, params.id);
  else await renderFolderGrid(container);
}
