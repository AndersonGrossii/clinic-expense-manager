import { api, revokeBlobUrl } from '../api.js';
import { billTypeLabel } from '../state.js';
import { esc, fmtEur, fmtDate, fmtSize, icons, openModal, toast, triggerBlobDownload } from '../ui.js';

export async function openFileViewerModal(doc, { onEdit } = {}) {
  let blobUrl = null;
  let loadedBlob = null;

  const modal = openModal({
    title: doc.name,
    size: 'xwide',
    body: `
      <div class="totals-bar">
        <div><span>Fecha</span><strong>${esc(fmtDate(doc.document_date))}</strong></div>
        <div><span>Tipo</span><strong>${esc(billTypeLabel(doc.bill_type))}</strong></div>
        <div><span>Carpeta</span><strong>${esc(doc.folder_name || '—')}</strong></div>
        <div><span>Base</span><strong>${esc(fmtEur(doc.base_amount))}</strong></div>
        <div><span>IVA (${esc(doc.tax_iva_rate)}%)</span><strong>${esc(fmtEur(doc.tax_iva_amount))}</strong></div>
        <div><span>Total</span><strong>${esc(fmtEur(doc.total_amount))}</strong></div>
      </div>
      ${doc.vendor_name || doc.invoice_number || doc.notes ? `
        <p class="muted">
          ${doc.vendor_name ? `Proveedor/Emisor: <strong>${esc(doc.vendor_name)}</strong>` : ''}
          ${doc.invoice_number ? ` · Nº Factura: <span class="mono">${esc(doc.invoice_number)}</span>` : ''}
          ${doc.notes ? ` · ${esc(doc.notes)}` : ''}
        </p>
      ` : ''}
      <div id="viewer-stage"><div class="spinner" aria-label="Cargando archivo"></div></div>
    `,
    footer: `
      <span class="muted">${esc(doc.file_original_name)} (${esc(fmtSize(doc.file_size_bytes))})</span>
      <span class="spacer"></span>
      ${doc.bill_type !== 'NOMINA' && onEdit ? `<button type="button" class="btn" id="viewer-edit-btn">${icons.edit}<span>Editar datos</span></button>` : ''}
      <button type="button" class="btn btn-primary" id="viewer-dl-btn">${icons.download}<span>Descargar</span></button>
    `,
    onClose: () => {
      if (blobUrl) revokeBlobUrl(blobUrl);
      blobUrl = null;
      loadedBlob = null;
    },
  });

  const stage = modal.body.querySelector('#viewer-stage');
  const dlBtn = modal.footer.querySelector('#viewer-dl-btn');
  const editBtn = modal.footer.querySelector('#viewer-edit-btn');

  if (editBtn) {
    editBtn.addEventListener('click', () => {
      modal.close();
      onEdit(doc);
    });
  }

  dlBtn.addEventListener('click', async () => {
    try {
      if (loadedBlob) {
        triggerBlobDownload(loadedBlob, doc.file_original_name);
        return;
      }
      const { blob, url } = await api.fetchFileBlob(doc.id, { download: true });
      triggerBlobDownload(blob, doc.file_original_name);
      revokeBlobUrl(url);
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  try {
    const { blob, url, mime } = await api.fetchFileBlob(doc.id);
    // Modal may have closed while fetching
    if (!document.body.contains(stage)) {
      revokeBlobUrl(url);
      return;
    }
    blobUrl = url;
    loadedBlob = blob;

    if (mime.startsWith('image/') && !mime.includes('heic') && !mime.includes('heif')) {
      const img = document.createElement('img');
      img.className = 'viewer-img';
      img.alt = doc.name;
      img.src = url;
      stage.innerHTML = '';
      stage.appendChild(img);
    } else if (mime === 'application/pdf') {
      const frame = document.createElement('iframe');
      frame.className = 'viewer';
      frame.title = doc.name;
      frame.src = url;
      stage.innerHTML = '';
      stage.appendChild(frame);
    } else {
      stage.innerHTML = `
        <div class="empty">
          <p>Vista previa directa no soportada para formato <span class="mono">${esc(mime)}</span>.</p>
          <p>Utiliza el botón <strong>Descargar</strong> para abrir el documento en tu equipo.</p>
        </div>
      `;
    }
  } catch (err) {
    if (document.body.contains(stage)) {
      stage.innerHTML = `<div class="form-error">${esc(err.message)}</div>`;
    }
  }
}
