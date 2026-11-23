import { api } from '../api.js';
import { billTypeLabel, getActiveClinic, navigate } from '../state.js';
import { MONTHS_ES, esc, fmtEur, icons, downloadCsv, toast } from '../ui.js';

export async function renderReportsView(container, params = {}) {
  const currentYear = new Date().getFullYear();
  let selectedYear = Number(params.year || currentYear);
  const years = Array.from({ length: 6 }, (_, i) => currentYear - 4 + i).reverse();

  async function load() {
    container.innerHTML = '<div class="spinner"></div>';
    try {
      const [spend, iva] = await Promise.all([
        api.get(`/reports/spend?year=${selectedYear}`),
        api.get(`/reports/iva?year=${selectedYear}`),
      ]);
      if (!document.body.contains(container)) return;

      const clinic = getActiveClinic();
      const totalNum = Number(spend.total.total_amount || 0);
      const prevNum = Number(spend.previousYearTotal || 0);
      const yoy = prevNum > 0 ? (((totalNum - prevNum) / prevNum) * 100).toFixed(1) : null;

      container.innerHTML = `
        <div class="page-head no-print">
          <div>
            <h2>Informes de gastos, costes e IVA</h2>
            <p>Cifras contables conciliadas para ${esc(clinic?.name || 'la clínica')} (${selectedYear}).</p>
          </div>
          <div class="row">
            <select id="rep-year" aria-label="Año del informe">
              ${years.map((y) => `<option value="${y}" ${y === selectedYear ? 'selected' : ''}>${y}</option>`).join('')}
            </select>
            <button type="button" id="rep-csv-spend" class="btn">${icons.download}<span>CSV Gastos</span></button>
            <button type="button" id="rep-csv-iva" class="btn">${icons.download}<span>CSV IVA</span></button>
            <button type="button" id="rep-print" class="btn btn-primary">${icons.printer}<span>Imprimir / PDF</span></button>
          </div>
        </div>

        <div class="card card-pad">
          <div class="row">
            <div>
              <h3>${esc(clinic?.name || 'Clínica')} — Ejercicio ${selectedYear}</h3>
              <div class="muted">${clinic?.tax_id_cif ? `CIF: ${esc(clinic.tax_id_cif)} · ` : ''}${esc(clinic?.address || '')}</div>
            </div>
            <div class="spacer"></div>
            <div class="muted">Generado el ${esc(new Date().toLocaleDateString('es-ES'))}</div>
          </div>
        </div>

        <div class="grid grid-4 mt" id="rep-kpis">
          <div class="card kpi" data-color="#2563EB">
            <div class="label">Gasto total anual</div>
            <div class="value">${esc(fmtEur(spend.total.total_amount))}</div>
            <div class="meta">${spend.total.count} documento(s)${yoy !== null ? ` · ${Number(yoy) >= 0 ? '+' : ''}${yoy}% vs ${selectedYear - 1}` : ''}</div>
          </div>
          <div class="card kpi" data-color="#0EA5E9">
            <div class="label">Base imponible total</div>
            <div class="value">${esc(fmtEur(spend.total.base_amount))}</div>
            <div class="meta">Año anterior: ${esc(fmtEur(spend.previousYearTotal))}</div>
          </div>
          <div class="card kpi" data-color="#10B981">
            <div class="label">IVA soportado deducible</div>
            <div class="value">${esc(fmtEur(iva.total.tax_iva_amount))}</div>
            <div class="meta">${iva.total.count} factura(s) con IVA (sin nóminas)</div>
          </div>
          <div class="card kpi" data-color="#F59E0B">
            <div class="label">Coste laboral (nóminas)</div>
            <div class="value">${esc(fmtEur(spend.payroll.total_company_cost))}</div>
            <div class="meta">${spend.payroll.count} nómina(s) · ${spend.payroll.workers} trabajador(es)</div>
          </div>
        </div>

        <div class="grid grid-2 mt">
          <section class="card">
            <div class="card-head">
              <h3>Resumen trimestral de IVA soportado</h3>
              <span class="hint">Exento: nóminas</span>
            </div>
            <div class="card-body table-wrap">
              <table class="table">
                <thead>
                  <tr><th>Trimestre</th><th class="num">Facturas</th><th class="num">Base</th><th class="num">IVA</th><th class="num">Total</th></tr>
                </thead>
                <tbody>
                  ${iva.quarters.map((q) => `
                    <tr>
                      <td><strong>T${q.quarter}</strong></td>
                      <td class="num">${q.count}</td>
                      <td class="num">${esc(fmtEur(q.base_amount))}</td>
                      <td class="num"><strong>${esc(fmtEur(q.tax_iva_amount))}</strong></td>
                      <td class="num">${esc(fmtEur(q.total_amount))}</td>
                    </tr>
                  `).join('')}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total ${selectedYear}</td>
                    <td class="num">${iva.total.count}</td>
                    <td class="num">${esc(fmtEur(iva.total.base_amount))}</td>
                    <td class="num">${esc(fmtEur(iva.total.tax_iva_amount))}</td>
                    <td class="num">${esc(fmtEur(iva.total.total_amount))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <section class="card">
            <div class="card-head">
              <h3>Desglose por tipo de IVA (%)</h3>
              <span class="hint">Modelo 303</span>
            </div>
            <div class="card-body table-wrap">
              ${!iva.byQuarterAndRate.length
                ? '<div class="empty">Sin facturas con IVA en este año.</div>'
                : `
                  <table class="table">
                    <thead>
                      <tr><th>Trimestre</th><th>Tipo</th><th class="num">Base</th><th class="num">Cuota IVA</th><th class="num">Total</th></tr>
                    </thead>
                    <tbody>
                      ${iva.byQuarterAndRate.map((r) => `
                        <tr>
                          <td>T${r.quarter}</td>
                          <td><span class="badge">${esc(r.rate)}%</span></td>
                          <td class="num">${esc(fmtEur(r.base_amount))}</td>
                          <td class="num"><strong>${esc(fmtEur(r.tax_iva_amount))}</strong></td>
                          <td class="num">${esc(fmtEur(r.total_amount))}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                `}
            </div>
          </section>
        </div>

        <section class="card mt">
          <div class="card-head">
            <h3>Desglose mensual de gastos (${selectedYear})</h3>
          </div>
          <div class="card-body table-wrap">
            <table class="table">
              <thead>
                <tr><th>Mes</th><th class="num">Documentos</th><th class="num">Base</th><th class="num">IVA</th><th class="num">Total pagado</th><th class="num">% Anual</th></tr>
              </thead>
              <tbody>
                ${spend.byMonth.map((m) => {
                  const pct = totalNum > 0 ? ((Number(m.total_amount) / totalNum) * 100).toFixed(1) : '0.0';
                  return `
                    <tr data-month="${selectedYear}-${String(m.month).padStart(2, '0')}">
                      <td><strong>${esc(MONTHS_ES[m.month - 1])}</strong></td>
                      <td class="num">${m.count}</td>
                      <td class="num">${esc(fmtEur(m.base_amount))}</td>
                      <td class="num">${esc(fmtEur(m.tax_iva_amount))}</td>
                      <td class="num"><strong>${esc(fmtEur(m.total_amount))}</strong></td>
                      <td class="num muted">${pct}%</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total ${selectedYear}</td>
                  <td class="num">${spend.total.count}</td>
                  <td class="num">${esc(fmtEur(spend.total.base_amount))}</td>
                  <td class="num">${esc(fmtEur(spend.total.tax_iva_amount))}</td>
                  <td class="num">${esc(fmtEur(spend.total.total_amount))}</td>
                  <td class="num">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <div class="grid grid-2 mt">
          <section class="card">
            <div class="card-head"><h3>Costes por categoría / tipo</h3></div>
            <div class="card-body table-wrap">
              ${!spend.byType.length
                ? '<div class="empty">Sin gastos en este año.</div>'
                : `
                  <table class="table">
                    <thead><tr><th>Categoría</th><th class="num">Docs</th><th class="num">Base</th><th class="num">IVA</th><th class="num">Total</th></tr></thead>
                    <tbody>
                      ${spend.byType.map((t) => `
                        <tr>
                          <td>${esc(billTypeLabel(t.bill_type))}</td>
                          <td class="num">${t.count}</td>
                          <td class="num">${esc(fmtEur(t.base_amount))}</td>
                          <td class="num">${esc(fmtEur(t.tax_iva_amount))}</td>
                          <td class="num"><strong>${esc(fmtEur(t.total_amount))}</strong></td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                `}
            </div>
          </section>

          <section class="card">
            <div class="card-head"><h3>Costes por carpeta y nóminas</h3></div>
            <div class="card-body table-wrap">
              ${!spend.byFolder.length
                ? '<div class="empty">Sin movimientos por carpeta.</div>'
                : `
                  <table class="table">
                    <thead><tr><th>Carpeta</th><th class="num">Docs</th><th class="num">Total</th></tr></thead>
                    <tbody>
                      ${spend.byFolder.map((f) => `
                        <tr>
                          <td><span class="badge" data-fcolor="${esc(f.color)}"><span class="dot"></span>${esc(f.folder_name)}</span></td>
                          <td class="num">${f.count}</td>
                          <td class="num"><strong>${esc(fmtEur(f.total_amount))}</strong></td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                `}
              <div class="totals-bar mt">
                <div><span>Bruto nóminas</span><strong>${esc(fmtEur(spend.payroll.gross_salary))}</strong></div>
                <div><span>IRPF</span><strong>${esc(fmtEur(spend.payroll.irpf_withholding))}</strong></div>
                <div><span>SS Empresa</span><strong>${esc(fmtEur(spend.payroll.social_security_company))}</strong></div>
                <div><span>Neto</span><strong>${esc(fmtEur(spend.payroll.net_salary))}</strong></div>
              </div>
            </div>
          </section>
        </div>
      `;

      for (const card of container.querySelectorAll('#rep-kpis .kpi')) {
        card.style.setProperty('--kpi-color', card.dataset.color);
      }
      for (const b of container.querySelectorAll('.badge[data-fcolor]')) {
        b.querySelector('.dot').style.backgroundColor = b.dataset.fcolor;
      }
      for (const tr of container.querySelectorAll('tr[data-month]')) {
        tr.addEventListener('click', () => navigate('search', { month: tr.dataset.month }));
      }

      container.querySelector('#rep-year').addEventListener('change', (e) => {
        selectedYear = Number(e.target.value);
        load();
      });
      container.querySelector('#rep-print').addEventListener('click', () => window.print());

      container.querySelector('#rep-csv-spend').addEventListener('click', () => {
        downloadCsv(
          `gastos_${selectedYear}_${clinic?.name || 'clinica'}.csv`,
          ['Mes', 'Documentos', 'Base (€)', 'IVA (€)', 'Total (€)'],
          spend.byMonth.map((m) => [
            `${MONTHS_ES[m.month - 1]} ${selectedYear}`, m.count, m.base_amount, m.tax_iva_amount, m.total_amount,
          ]),
        );
        toast('CSV de gastos exportado');
      });

      container.querySelector('#rep-csv-iva').addEventListener('click', () => {
        downloadCsv(
          `iva_${selectedYear}_${clinic?.name || 'clinica'}.csv`,
          ['Trimestre', 'Tipo IVA (%)', 'Facturas', 'Base (€)', 'Cuota IVA (€)', 'Total (€)'],
          iva.byQuarterAndRate.map((r) => [
            `T${r.quarter}`, `${r.rate}%`, r.count, r.base_amount, r.tax_iva_amount, r.total_amount,
          ]),
        );
        toast('CSV de IVA exportado');
      });
    } catch (err) {
      if (document.body.contains(container)) {
        container.innerHTML = `<div class="form-error">${esc(err.message)}</div>`;
      }
    }
  }

  await load();
}
