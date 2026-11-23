import { api, revokeBlobUrl } from '../api.js';
import { state, loadFolders, billTypeLabel } from '../state.js';
import { esc, fmtEur, fmtDate, fmtMonth, icons, confirmDialog, toast, downloadCsv, triggerBlobDownload } from '../ui.js';
import { openFileViewerModal } from '../modals/fileViewerModal.js';
import { openDocumentModal } from '../modals/documentModal.js';

function monthToRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` };
}

function quarterRange(year, q) {
  const s = (q - 1) * 3 + 1;
  const e = s + 2;
  const last = new Date(Date.UTC(year, e, 0)).getUTCDate();
  return { from: `${year}-${String(s).padStart(2, '0')}-01`, to: `${year}-${String(e).padStart(2, '0')}-${String(last).padStart(2, '0')}` };
}

export async function renderSearchView(container, params = {}) {
  const folders = await loadFolders();
  if (!document.body.contains(container)) return;

  const initialDates = params.month ? monthToRange(params.month) : { from: params.from || '', to: params.to || '' };
  const filters = {
    q: params.q || '',
    from: initialDates.from,
    to: initialDates.to,
    type: params.type || '',
    folderId: params.folderId || '',
    sort: params.sort || 'date_desc',
    page: Number(params.page || 1),
  };

  const now = new Date();
  const cy = now.getFullYear();

  container.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Búsqueda de documentos y facturas</h2>
        <p>Filtra por nombre, proveedor, rango de fechas, tipo de gasto o carpeta.</p>
      </div>
      <div class="row">
        <button id="sr-export-csv" type="button" class="btn">${icons.download}<span>Exportar CSV</span></button>
        <button id="sr-upload-btn" type="button" class="btn btn-primary">${icons.upload}<span>Subir documento</span></button>
      </div>
    </div>

    <section class="card card-pad">
      <div class="filters">
        <div class="field">
          <label for="sr-q">Nombre, proveedor o nº factura</label>
          <input id="sr-q" class="input" type="search" value="${esc(filters.q)}" placeholder="Ej. Agua, Material, F-2026…">
        </div>
        <div class="field">
          <label for="sr-from">Desde</label>
          <input id="sr-from" class="input" type="date" value="${esc(filters.from)}">
        </div>
        <div class="field">
          <label for="sr-to">Hasta</label>
          <input id="sr-to" class="input" type="date" value="${esc(filters.to)}">
        </div>
        <div class="field">
          <label for="sr-type">Tipo de factura</label>
          <select id="sr-type">
            <option value="">Todos los tipos</option>
            ${state.meta.billTypes.map((t) => `<option value="${esc(t.code)}" ${t.code === filters.type ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="sr-folder">Carpeta</label>
          <select id="sr-folder">
            <option value="">Todas las carpetas</option>
            ${folders.map((f) => `<option value="${esc(f.id)}" ${f.id === filters.folderId ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="sr-sort">Orden</label>
          <select id="sr-sort">
            <option value="date_desc" ${filters.sort === 'date_desc' ? 'selected' : ''}>Fecha ↓</option>
            <option value="date_asc" ${filters.sort === 'date_asc' ? 'selected' : ''}>Fecha ↑</option>
            <option value="total_desc" ${filters.sort === 'total_desc' ? 'selected' : ''}>Importe ↓</option>
            <option value="total_asc" ${filters.sort === 'total_asc' ? 'selected' : ''}>Importe ↑</option>
            <option value="name_asc" ${filters.sort === 'name_asc' ? 'selected' : ''}>Nombre A–Z</option>
          </select>
        </div>
      </div>

      <div class="presets">
        <button type="button" class="chip" data-preset="this_month">Este mes</button>
        <button type="button" class="chip" data-preset="prev_month">Mes anterior</button>
        <button type="button" class="chip" data-preset="q1">T1 ${cy}</button>
        <button type="button" class="chip" data-preset="q2">T2 ${cy}</button>
        <button type="button" class="chip" data-preset="q3">T3 ${cy}</button>
        <button type="button" class="chip" data-preset="q4">T4 ${cy}</button>
        <button type="button" class="chip" data-preset="year">Año ${cy}</button>
        <button type="button" class="chip" data-preset="clear">Limpiar filtros</button>
        ${params.month ? `<span class="badge badge-blue">Filtro gráfico: ${esc(fmtMonth(params.month))}</span>` : ''}
      </div>
    </section>

    <div id="sr-totals" class="totals-bar mt"></div>
    <div id="sr-results" class="card"><div class="spinner"></div></div>
  `;

  const qEl = container.querySelector('#sr-q');
  const fromEl = container.querySelector('#sr-from');
  const toEl = container.querySelector('#sr-to');
  const typeEl = container.querySelector('#sr-type');
  const folderEl = container.querySelector('#sr-folder');
  const sortEl = container.querySelector('#sr-sort');
  const totalsBox = container.querySelector('#sr-totals');
  const resultsBox = container.querySelector('#sr-results');

  let lastItems = [];

  function buildQuery(limit = 50) {
    const sp = new URLSearchParams();
    if (filters.q) sp.set('q', filters.q);
    if (filters.from) sp.set('from', filters.from);
    if (filters.to) sp.set('to', filters.to);
    if (filters.type) sp.set('type', filters.type);
    if (filters.folderId) sp.set('folderId', filters.folderId);
    if (filters.sort) sp.set('sort', filters.sort);
    sp.set('page', String(filters.page));
    sp.set('limit', String(limit));
    return sp.toString();
  }

  async function runSearch() {
    try {
      const data = await api.get(`/documents?${buildQuery(50)}`);
      if (!document.body.contains(container)) return;
      lastItems = data.items;
      const { totals, pagination } = data;

      totalsBox.innerHTML = `
        <div><span>Coincidencias</span><strong>${pagination.total}</strong></div>
        <div><span>Base imponible</span><strong>${esc(fmtEur(totals.base_amount))}</strong></div>
        <div><span>IVA soportado</span><strong>${esc(fmtEur(totals.tax_iva_amount))}</strong></div>
        <div><span>Total filtrado</span><strong>${esc(fmtEur(totals.total_amount))}</strong></div>
      `;

      if (!data.items.length) {
        resultsBox.innerHTML = `<div class="empty">${icons.search}<p>No se encontraron documentos con los filtros actuales.</p></div>`;
        return;
      }

      const docMap = new Map(data.items.map((d) => [d.id, d]));

      resultsBox.innerHTML = `
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Fecha</th><th>Documento</th><th>Carpeta</th><th>Tipo</th>
                <th class="num">Base</th><th class="num">IVA</th><th class="num">Total</th>
                <th class="actions">Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${data.items.map((d) => `
                <tr>
                  <td class="nowrap">${esc(fmtDate(d.document_date))}</td>
                  <td>
                    <div class="doc-name">${esc(d.name)}</div>
                    <div class="sub">${esc([d.vendor_name, d.invoice_number].filter(Boolean).join(' · ') || d.file_original_name)}</div>
                  </td>
                  <td><span class="badge" data-fcolor="${esc(d.folder_color)}"><span class="dot"></span>${esc(d.folder_name)}</span></td>
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
        <div class="pagination">
          <span>Página ${pagination.page} de ${pagination.pages} (${pagination.total} resultados)</span>
          <div class="row">
            <button type="button" class="btn btn-sm" id="pg-prev" ${pagination.page <= 1 ? 'disabled' : ''}>Anterior</button>
            <button type="button" class="btn btn-sm" id="pg-next" ${pagination.page >= pagination.pages ? 'disabled' : ''}>Siguiente</button>
          </div>
        </div>
      `;

      for (const b of resultsBox.querySelectorAll('.badge[data-fcolor]')) {
        b.querySelector('.dot').style.backgroundColor = b.dataset.fcolor;
      }

      resultsBox.querySelector('#pg-prev')?.addEventListener('click', () => { filters.page -= 1; runSearch(); });
      resultsBox.querySelector('#pg-next')?.addEventListener('click', () => { filters.page += 1; runSearch(); });

      for (const b of resultsBox.querySelectorAll('[data-view]')) {
        b.addEventListener('click', () => {
          const d = docMap.get(b.dataset.view);
          openFileViewerModal(d, {
            onEdit: d.bill_type === 'NOMINA' ? null : (doc) => openDocumentModal({ doc, onSaved: runSearch }),
          });
        });
      }
      for (const b of resultsBox.querySelectorAll('[data-dl]')) {
        b.addEventListener('click', async () => {
          const d = docMap.get(b.dataset.dl);
          try {
            const { blob, url } = await api.fetchFileBlob(d.id, { download: true });
            triggerBlobDownload(blob, d.file_original_name);
            revokeBlobUrl(url);
          } catch (err) { toast(err.message, 'error'); }
        });
      }
      for (const b of resultsBox.querySelectorAll('[data-edit]')) {
        b.addEventListener('click', () => openDocumentModal({ doc: docMap.get(b.dataset.edit), onSaved: runSearch }));
      }
      for (const b of resultsBox.querySelectorAll('[data-del]')) {
        b.addEventListener('click', async () => {
          const d = docMap.get(b.dataset.del);
          const ok = await confirmDialog({
            title: 'Eliminar documento',
            message: `¿Eliminar "${d.name}" (${fmtEur(d.total_amount)})?`,
            confirmLabel: 'Eliminar',
            danger: true,
          });
          if (!ok) return;
          try {
            await api.del(`/documents/${d.id}`);
            toast('Documento eliminado');
            runSearch();
          } catch (err) { toast(err.message, 'error'); }
        });
      }
    } catch (err) {
      if (document.body.contains(container)) resultsBox.innerHTML = `<div class="form-error">${esc(err.message)}</div>`;
    }
  }

  let debounceTimer;
  qEl.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      filters.q = qEl.value.trim();
      filters.page = 1;
      runSearch();
    }, 260);
  });

  for (const [el, key] of [[fromEl, 'from'], [toEl, 'to'], [typeEl, 'type'], [folderEl, 'folderId'], [sortEl, 'sort']]) {
    el.addEventListener('change', () => {
      filters[key] = el.value;
      filters.page = 1;
      runSearch();
    });
  }

  for (const chip of container.querySelectorAll('[data-preset]')) {
    chip.addEventListener('click', () => {
      const p = chip.dataset.preset;
      if (p === 'clear') {
        filters.q = ''; filters.from = ''; filters.to = ''; filters.type = ''; filters.folderId = '';
        qEl.value = ''; fromEl.value = ''; toEl.value = ''; typeEl.value = ''; folderEl.value = '';
      } else if (p === 'this_month') {
        const ym = `${cy}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const r = monthToRange(ym);
        filters.from = r.from; filters.to = r.to;
      } else if (p === 'prev_month') {
        const prev = new Date(Date.UTC(cy, now.getMonth() - 1, 1));
        const ym = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
        const r = monthToRange(ym);
        filters.from = r.from; filters.to = r.to;
      } else if (p.startsWith('q')) {
        const r = quarterRange(cy, Number(p.slice(1)));
        filters.from = r.from; filters.to = r.to;
      } else if (p === 'year') {
        filters.from = `${cy}-01-01`; filters.to = `${cy}-12-31`;
      }
      fromEl.value = filters.from;
      toEl.value = filters.to;
      filters.page = 1;
      runSearch();
    });
  }

  container.querySelector('#sr-upload-btn').addEventListener('click', () => {
    openDocumentModal({ defaultFolderId: filters.folderId || null, onSaved: runSearch });
  });

  container.querySelector('#sr-export-csv').addEventListener('click', async () => {
    try {
      const sp = new URLSearchParams(buildQuery(500));
      sp.set('page', '1');
      const data = await api.get(`/documents?${sp.toString()}`);
      if (!data.items.length) { toast('No hay datos para exportar', 'error'); return; }
      downloadCsv(
        `documentos_${new Date().toISOString().slice(0, 10)}.csv`,
        ['Fecha', 'Concepto', 'Proveedor', 'Nº Factura', 'Carpeta', 'Tipo', 'Base (€)', '% IVA', 'Cuota IVA (€)', 'Total (€)'],
        data.items.map((d) => [
          d.document_date, d.name, d.vendor_name || '', d.invoice_number || '',
          d.folder_name, billTypeLabel(d.bill_type), d.base_amount, d.tax_iva_rate, d.tax_iva_amount, d.total_amount,
        ]),
      );
      toast(`CSV exportado (${data.items.length} filas)`);
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  await runSearch();
}
