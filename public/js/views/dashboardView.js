import { api } from '../api.js';
import { billTypeLabel, navigate } from '../state.js';
import { renderMonthlyChart, renderTypeDonut, renderFolderBars } from '../charts.js';
import { esc, fmtEur, fmtDate, TYPE_COLORS, toast } from '../ui.js';
import { openFileViewerModal } from '../modals/fileViewerModal.js';
import { openDocumentModal } from '../modals/documentModal.js';

function currentQuarterRange() {
  const now = new Date();
  const y = now.getFullYear();
  const q = Math.floor(now.getMonth() / 3);
  const startM = q * 3 + 1;
  const endM = startM + 2;
  const lastDay = new Date(Date.UTC(y, endM, 0)).getUTCDate();
  return {
    from: `${y}-${String(startM).padStart(2, '0')}-01`,
    to: `${y}-${String(endM).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

function currentMonthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    from: `${y}-${String(m).padStart(2, '0')}-01`,
    to: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

export async function renderDashboardView(container) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 3 + i).reverse();

  let filterState = {
    mode: 'year', // 'year' | 'month' | 'quarter' | 'custom'
    year: currentYear,
    from: `${currentYear}-01-01`,
    to: `${currentYear}-12-31`,
  };

  container.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Resumen financiero</h2>
        <p>Haz clic en cualquier tarjeta, barra o categoría del gráfico para abrir los documentos correspondientes.</p>
      </div>
      <div class="row">
        <div class="seg" id="dash-presets">
          <button type="button" data-mode="year" class="active">Año</button>
          <button type="button" data-mode="quarter">Trimestre actual</button>
          <button type="button" data-mode="month">Este mes</button>
          <button type="button" data-mode="custom">Rango</button>
        </div>
        <select id="dash-year" aria-label="Año">
          ${years.map((y) => `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`).join('')}
        </select>
        <div id="dash-custom-range" class="row" hidden>
          <input id="dash-from" type="date" class="input" value="${filterState.from}" aria-label="Desde">
          <input id="dash-to" type="date" class="input" value="${filterState.to}" aria-label="Hasta">
        </div>
      </div>
    </div>

    <div id="dash-kpis" class="grid grid-4"></div>

    <div class="grid grid-2-1 mt">
      <section class="card">
        <div class="card-head">
          <h3>Importe pagado e IVA pagado por mes</h3>
          <span class="hint">Clic en un mes para ver facturas</span>
        </div>
        <div class="card-body" id="dash-monthly-chart"><div class="spinner"></div></div>
      </section>

      <section class="card">
        <div class="card-head">
          <h3>Gastos por tipo</h3>
          <span class="hint">Clic para filtrar</span>
        </div>
        <div class="card-body" id="dash-type-chart"><div class="spinner"></div></div>
      </section>
    </div>

    <div class="grid grid-2 mt">
      <section class="card">
        <div class="card-head">
          <h3>Gasto por carpeta</h3>
          <span class="hint">Clic para abrir carpeta</span>
        </div>
        <div class="card-body" id="dash-folder-chart"></div>
      </section>

      <section class="card">
        <div class="card-head">
          <h3>Últimos documentos</h3>
          <a href="#search" class="hint">Ver todos →</a>
        </div>
        <div class="card-body" id="dash-recent"></div>
      </section>
    </div>
  `;

  const yearSel = container.querySelector('#dash-year');
  const customBox = container.querySelector('#dash-custom-range');
  const fromEl = container.querySelector('#dash-from');
  const toEl = container.querySelector('#dash-to');
  const presetBtns = container.querySelectorAll('#dash-presets button');

  async function refresh() {
    const kpiBox = container.querySelector('#dash-kpis');
    const monthlyBox = container.querySelector('#dash-monthly-chart');
    const typeBox = container.querySelector('#dash-type-chart');
    const folderBox = container.querySelector('#dash-folder-chart');
    const recentBox = container.querySelector('#dash-recent');

    try {
      const qs = filterState.mode === 'year'
        ? `year=${filterState.year}`
        : `from=${encodeURIComponent(filterState.from)}&to=${encodeURIComponent(filterState.to)}`;
      const data = await api.get(`/dashboard?${qs}`);
      if (!document.body.contains(container)) return;

      const { kpis, period } = data;
      const drillDates = { from: period.from, to: period.to };

      kpiBox.innerHTML = `
        <article class="card kpi" data-kpi="total" data-color="#2563EB" tabindex="0" role="button">
          <div class="label">Total pagado</div>
          <div class="value">${esc(fmtEur(kpis.total_amount))}</div>
          <div class="meta">${kpis.document_count} documento(s) · Ver listado →</div>
        </article>
        <article class="card kpi" data-kpi="base" data-color="#0EA5E9" tabindex="0" role="button">
          <div class="label">Base imponible / neto</div>
          <div class="value">${esc(fmtEur(kpis.base_amount))}</div>
          <div class="meta">Operativo: ${esc(fmtEur(kpis.operating_amount))}</div>
        </article>
        <article class="card kpi" data-kpi="iva" data-color="#10B981" tabindex="0" role="button">
          <div class="label">IVA pagado (soportado)</div>
          <div class="value">${esc(fmtEur(kpis.tax_iva_amount))}</div>
          <div class="meta">Excluye nóminas · Ver informe IVA →</div>
        </article>
        <article class="card kpi" data-kpi="nominas" data-color="#F59E0B" tabindex="0" role="button">
          <div class="label">Coste en nóminas</div>
          <div class="value">${esc(fmtEur(kpis.nominas_amount))}</div>
          <div class="meta">IVA 0% exento · Filtrar nóminas →</div>
        </article>
      `;

      for (const card of kpiBox.querySelectorAll('.kpi')) {
        card.style.setProperty('--kpi-color', card.dataset.color);
        const go = () => {
          const k = card.dataset.kpi;
          if (k === 'iva') navigate('reports', { year: String(period.from || currentYear).slice(0, 4) });
          else if (k === 'nominas') navigate('search', { ...drillDates, type: 'NOMINA' });
          else navigate('search', drillDates);
        };
        card.addEventListener('click', go);
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
        });
      }

      renderMonthlyChart(monthlyBox, data.monthly, {
        onSelectMonth: (month) => navigate('search', { month }),
      });

      renderTypeDonut(typeBox, data.byType, {
        labelOf: billTypeLabel,
        colorOf: (code) => TYPE_COLORS[code] || '#64748B',
        onSelectType: (code) => navigate('search', { ...drillDates, type: code }),
      });

      renderFolderBars(folderBox, data.byFolder, {
        onSelectFolder: (folderId) => navigate('folders', { id: folderId }),
      });

      if (!data.recent.length) {
        recentBox.innerHTML = '<div class="empty">Aún no hay documentos en este periodo.</div>';
      } else {
        recentBox.innerHTML = `
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr><th>Documento</th><th>Tipo</th><th>Fecha</th><th class="num">Total</th></tr>
              </thead>
              <tbody>
                ${data.recent.map((r) => `
                  <tr data-doc-id="${esc(r.id)}" tabindex="0" role="button">
                    <td>
                      <div class="doc-name">${esc(r.name)}</div>
                      ${r.vendor_name ? `<div class="sub">${esc(r.vendor_name)}</div>` : ''}
                    </td>
                    <td><span class="badge">${esc(billTypeLabel(r.bill_type))}</span></td>
                    <td class="nowrap">${esc(fmtDate(r.document_date))}</td>
                    <td class="num"><strong>${esc(fmtEur(r.total_amount))}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
        for (const tr of recentBox.querySelectorAll('tr[data-doc-id]')) {
          const openDoc = async () => {
            try {
              const fullDoc = await api.get(`/documents/${tr.dataset.docId}`);
              openFileViewerModal(fullDoc, {
                onEdit: (d) => openDocumentModal({ doc: d, onSaved: refresh }),
              });
            } catch (err) {
              toast(err.message, 'error');
            }
          };
          tr.addEventListener('click', openDoc);
          tr.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDoc(); }
          });
        }
      }
    } catch (err) {
      if (document.body.contains(container)) {
        kpiBox.innerHTML = `<div class="form-error full">${esc(err.message)}</div>`;
      }
    }
  }

  for (const btn of presetBtns) {
    btn.addEventListener('click', () => {
      for (const b of presetBtns) b.classList.remove('active');
      btn.classList.add('active');
      filterState.mode = btn.dataset.mode;

      yearSel.hidden = filterState.mode !== 'year';
      customBox.hidden = filterState.mode !== 'custom';

      if (filterState.mode === 'year') {
        filterState.from = `${filterState.year}-01-01`;
        filterState.to = `${filterState.year}-12-31`;
      } else if (filterState.mode === 'quarter') {
        Object.assign(filterState, currentQuarterRange());
      } else if (filterState.mode === 'month') {
        Object.assign(filterState, currentMonthRange());
      } else {
        filterState.from = fromEl.value;
        filterState.to = toEl.value;
      }
      refresh();
    });
  }

  yearSel.addEventListener('change', () => {
    filterState.year = Number(yearSel.value);
    filterState.from = `${filterState.year}-01-01`;
    filterState.to = `${filterState.year}-12-31`;
    refresh();
  });

  fromEl.addEventListener('change', () => { filterState.from = fromEl.value; refresh(); });
  toEl.addEventListener('change', () => { filterState.to = toEl.value; refresh(); });

  await refresh();
}
