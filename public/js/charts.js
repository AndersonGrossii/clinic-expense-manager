import { esc, fmtEur, fmtMonth, MONTHS_SHORT_ES } from './ui.js';

function attachTooltip(container) {
  let tip = container.querySelector('.chart-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'chart-tooltip';
    tip.hidden = true;
    container.appendChild(tip);
  }
  return {
    show(targetEl, html) {
      const box = container.getBoundingClientRect();
      const rect = targetEl.getBoundingClientRect();
      tip.innerHTML = html;
      tip.hidden = false;
      const halfW = tip.offsetWidth / 2;
      const rawLeft = rect.left - box.left + rect.width / 2;
      const clampedLeft = Math.min(Math.max(rawLeft, halfW + 8), Math.max(halfW + 8, box.width - halfW - 8));
      tip.style.left = `${clampedLeft}px`;
      tip.style.top = `${Math.max(8, rect.top - box.top)}px`;
    },
    hide() {
      tip.hidden = true;
    },
  };
}

function niceMax(maxVal) {
  if (maxVal <= 0) return 100;
  const pow = 10 ** Math.floor(Math.log10(maxVal));
  const norm = maxVal / pow;
  const step = norm <= 1.2 ? 1.2 : norm <= 2 ? 2 : norm <= 3 ? 3 : norm <= 5 ? 5 : 10;
  return step * pow;
}

/**
 * Interactive stacked monthly bar chart: Base Imponible + IVA Pagado = Total Pagado.
 * Clicking any bar/month column triggers onSelectMonth('YYYY-MM').
 */
export function renderMonthlyChart(container, monthly, { onSelectMonth } = {}) {
  if (!monthly || !monthly.length) {
    container.innerHTML = '<div class="empty">Sin movimientos en el periodo seleccionado.</div>';
    return;
  }

  const maxTotal = Math.max(...monthly.map((m) => Number(m.total_amount || 0)), 0);
  const ceiling = niceMax(maxTotal);
  const W = 720;
  const H = 250;
  const padL = 62;
  const padR = 16;
  const padT = 16;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const colW = plotW / monthly.length;
  const barW = Math.max(10, Math.min(36, colW * 0.58));

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const y = padT + plotH * (1 - t);
    const val = Math.round(ceiling * t);
    const label = val >= 1000 ? `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k €` : `${val} €`;
    return `
      <line class="grid-line" x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" />
      <text x="${padL - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end">${esc(label)}</text>
    `;
  }).join('');

  const bars = monthly.map((m, idx) => {
    const total = Number(m.total_amount || 0);
    const base = Number(m.base_amount || 0);
    const iva = Number(m.tax_iva_amount || 0);
    const cx = padL + idx * colW + colW / 2;
    const x = cx - barW / 2;
    const totalH = ceiling > 0 ? (total / ceiling) * plotH : 0;
    const baseH = ceiling > 0 ? (base / ceiling) * plotH : 0;
    const ivaH = Math.max(0, totalH - baseH);
    const yIva = padT + plotH - totalH;
    const yBase = padT + plotH - baseH;
    const monthNum = Number(m.month.split('-')[1]);
    const label = MONTHS_SHORT_ES[monthNum - 1] || m.month;

    return `
      <g class="bar" data-month="${esc(m.month)}" role="button" tabindex="0" aria-label="${esc(fmtMonth(m.month))}: ${esc(fmtEur(total))}">
        <rect x="${(cx - colW / 2).toFixed(1)}" y="${padT}" width="${colW.toFixed(1)}" height="${plotH}" fill="transparent" />
        ${base > 0 ? `<rect x="${x.toFixed(1)}" y="${yBase.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(2, baseH).toFixed(1)}" rx="3" fill="#2563EB" />` : ''}
        ${iva > 0 ? `<rect x="${x.toFixed(1)}" y="${yIva.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(2, ivaH).toFixed(1)}" rx="3" fill="#0EA5E9" />` : ''}
        <text class="axis" x="${cx.toFixed(1)}" y="${H - 12}" text-anchor="middle">${esc(label)}</text>
      </g>
    `;
  }).join('');

  container.innerHTML = `
    <div class="chart">
      <div class="chart-scroll">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
          <g class="axis">${gridLines}</g>
          ${bars}
        </svg>
      </div>
      <div class="chart-legend">
        <span class="item"><span class="sw" data-sw="#2563EB"></span>Importe base / neto</span>
        <span class="item"><span class="sw" data-sw="#0EA5E9"></span>IVA pagado</span>
        <span class="muted">Haz clic en cualquier mes para ver sus documentos</span>
      </div>
    </div>
  `;

  for (const sw of container.querySelectorAll('.sw[data-sw]')) {
    sw.style.backgroundColor = sw.dataset.sw;
  }

  const chartBox = container.querySelector('.chart');
  const tip = attachTooltip(chartBox);
  const byMonth = new Map(monthly.map((m) => [m.month, m]));

  for (const g of container.querySelectorAll('.bar[data-month]')) {
    const m = byMonth.get(g.dataset.month);
    const activate = () => onSelectMonth && onSelectMonth(m.month);
    g.addEventListener('click', activate);
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
    });
    g.addEventListener('mouseenter', () => {
      tip.show(
        g,
        `<div><strong>${esc(fmtMonth(m.month))}</strong> (${m.count} doc.)</div>
         <div>Base: <b>${esc(fmtEur(m.base_amount))}</b> · IVA: <b>${esc(fmtEur(m.tax_iva_amount))}</b></div>
         <div>Total pagado: <b>${esc(fmtEur(m.total_amount))}</b></div>`,
      );
    });
    g.addEventListener('mouseleave', () => tip.hide());
  }
}

/**
 * Interactive SVG Donut chart for Spend by Bill Type.
 * Clicking any slice or legend row calls onSelectType(billType).
 */
export function renderTypeDonut(container, byType, { labelOf, colorOf, onSelectType } = {}) {
  const rows = (byType || []).filter((r) => Number(r.total_amount || 0) > 0);
  if (!rows.length) {
    container.innerHTML = '<div class="empty">No hay gastos registrados en este periodo.</div>';
    return;
  }

  const grandTotal = rows.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
  const R = 70;
  const C = 2 * Math.PI * R;
  let offset = 0;

  const circles = rows.map((r) => {
    const val = Number(r.total_amount || 0);
    const frac = grandTotal > 0 ? val / grandTotal : 0;
    const len = frac * C;
    const dashArray = `${len.toFixed(2)} ${(C - len).toFixed(2)}`;
    const dashOffset = (-offset).toFixed(2);
    offset += len;
    const color = colorOf ? colorOf(r.bill_type) : '#2563EB';
    const label = labelOf ? labelOf(r.bill_type) : r.bill_type;

    return `<circle class="slice" data-type="${esc(r.bill_type)}"
      cx="100" cy="100" r="${R}" fill="none" stroke="${esc(color)}" stroke-width="26"
      stroke-dasharray="${dashArray}" stroke-dashoffset="${dashOffset}"
      transform="rotate(-90 100 100)" role="button" tabindex="0"
      aria-label="${esc(label)}: ${esc(fmtEur(val))}" />`;
  }).join('');

  const listHtml = rows.map((r) => {
    const val = Number(r.total_amount || 0);
    const pct = grandTotal > 0 ? ((val / grandTotal) * 100).toFixed(1) : '0.0';
    const label = labelOf ? labelOf(r.bill_type) : r.bill_type;
    const color = colorOf ? colorOf(r.bill_type) : '#2563EB';

    return `
      <div class="type-row" data-type="${esc(r.bill_type)}" data-color="${esc(color)}" role="button" tabindex="0">
        <span class="sw"></span>
        <span>${esc(label)} <span class="muted">(${r.count})</span></span>
        <span class="amt">${esc(fmtEur(val))}<span class="pct">${pct}%</span></span>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="chart donut-wrap">
      <svg viewBox="0 0 200 200">
        ${circles}
        <text x="100" y="94" text-anchor="middle" font-size="11" fill="#64748b">Total periodo</text>
        <text x="100" y="114" text-anchor="middle" font-size="15" font-weight="800" fill="#0f172a">${esc(fmtEur(grandTotal))}</text>
      </svg>
      <div class="type-list">${listHtml}</div>
    </div>
  `;

  for (const row of container.querySelectorAll('.type-row[data-color]')) {
    row.querySelector('.sw').style.backgroundColor = row.dataset.color;
  }

  const chartBox = container.querySelector('.chart');
  const tip = attachTooltip(chartBox);
  const byCode = new Map(rows.map((r) => [r.bill_type, r]));

  for (const el of container.querySelectorAll('[data-type]')) {
    const r = byCode.get(el.dataset.type);
    const label = labelOf ? labelOf(r.bill_type) : r.bill_type;
    const pct = grandTotal > 0 ? ((Number(r.total_amount) / grandTotal) * 100).toFixed(1) : '0.0';
    const activate = () => onSelectType && onSelectType(r.bill_type);

    el.addEventListener('click', activate);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
    });
    if (el.classList.contains('slice')) {
      el.addEventListener('mouseenter', () => {
        tip.show(el, `<strong>${esc(label)}</strong>: <b>${esc(fmtEur(r.total_amount))}</b> (${pct}%)`);
      });
      el.addEventListener('mouseleave', () => tip.hide());
    }
  }
}

/**
 * Interactive horizontal folder breakdown bars.
 * Clicking a folder opens that folder directly.
 */
export function renderFolderBars(container, byFolder, { onSelectFolder } = {}) {
  const rows = byFolder || [];
  if (!rows.length) {
    container.innerHTML = '<div class="empty">Ninguna carpeta tiene gastos aún.</div>';
    return;
  }
  const maxVal = Math.max(...rows.map((r) => Number(r.total_amount || 0)), 1);

  container.innerHTML = `
    <div class="chart type-list">
      ${rows.map((r) => {
        const val = Number(r.total_amount || 0);
        const pct = Math.max(4, Math.round((val / maxVal) * 100));
        return `
          <div class="type-row hbar" data-folder-id="${esc(r.folder_id)}" data-color="${esc(r.color || '#2563EB')}" role="button" tabindex="0">
            <span class="sw"></span>
            <div>
              <div><strong>${esc(r.folder_name)}</strong> <span class="muted">(${r.count} doc.)</span></div>
              <svg viewBox="0 0 100 6" preserveAspectRatio="none" height="6">
                <rect x="0" y="0" width="100" height="6" rx="3" fill="#e2e8f0" />
                <rect x="0" y="0" width="${pct}" height="6" rx="3" fill="${esc(r.color || '#2563EB')}" />
              </svg>
            </div>
            <span class="amt">${esc(fmtEur(val))}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;

  for (const row of container.querySelectorAll('.type-row[data-folder-id]')) {
    row.querySelector('.sw').style.backgroundColor = row.dataset.color;
    const activate = () => onSelectFolder && onSelectFolder(row.dataset.folderId);
    row.addEventListener('click', activate);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
    });
  }
}
