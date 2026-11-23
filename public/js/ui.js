const eurFmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

export const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
export const MONTHS_SHORT_ES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

export const TYPE_COLORS = {
  AGUA: '#0EA5E9',
  LUZ_GAS: '#F97316',
  TELEFONO_INTERNET: '#06B6D4',
  COMPRAS_MATERIAL: '#8B5CF6',
  LABORATORIO: '#EC4899',
  ALQUILER: '#6366F1',
  SEGUROS: '#14B8A6',
  MANTENIMIENTO: '#EAB308',
  MARKETING: '#F43F5E',
  GESTORIA: '#64748B',
  IMPUESTOS: '#EF4444',
  GASTOS_GENERALES: '#10B981',
  NOMINA: '#F59E0B',
  OTROS: '#94A3B8',
};

export const CLINIC_COLORS = [
  '#0EA5E9', '#2563EB', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6',
];

export function esc(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function fmtEur(val) {
  const n = Number(val || 0);
  return eurFmt.format(Number.isFinite(n) ? n : 0);
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !d) return esc(iso);
  return `${d}/${m}/${y}`;
}

export function fmtMonth(ym) {
  if (!ym || !ym.includes('-')) return ym || '—';
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS_ES[m - 1] || m} ${y}`;
}

export function fmtSize(bytes) {
  const b = Number(bytes || 0);
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

export function initials(name) {
  return String(name || 'C').trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || 'C';
}

// ── Integer-cent helpers (matching server/utils/money.js) ─────────────
export function toCents(val) {
  if (val === null || val === undefined || val === '') return null;
  let str = typeof val === 'number' ? val.toFixed(2) : String(val).trim();
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(str)) str = str.replace(/\./g, '');
  if (!/^\d{1,10}([.,]\d{1,2})?$/.test(str)) return null;
  const [i, d = ''] = str.replace(',', '.').split('.');
  return Number.parseInt(i, 10) * 100 + Number.parseInt((d + '00').slice(0, 2), 10);
}

export function fromCents(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function ivaFromBaseCents(baseCents, rate) {
  const rh = Math.round(Number(rate) * 100);
  return Math.floor((baseCents * rh + 5000) / 10000);
}

// ── Inline SVG icons ─────────────────────────────────────────────────
export const icons = {
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  printer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
  pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15h6"/><path d="M9 11h3"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="9" y1="6" x2="9" y2="6.01"/><line x1="15" y1="6" x2="15" y2="6.01"/><line x1="9" y1="10" x2="9" y2="10.01"/><line x1="15" y1="10" x2="15" y2="10.01"/><path d="M9 22v-4h6v4"/></svg>',
};

// ── Toast notifications ──────────────────────────────────────────────
export function toast(message, type = 'success') {
  const stack = document.getElementById('toast-stack');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'error' : ''}`;
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

// ── Modal manager ────────────────────────────────────────────────────
let activeModalClose = null;

export function closeModal() {
  const root = document.getElementById('modal-root');
  if (!root) return;
  if (typeof activeModalClose === 'function') {
    const fn = activeModalClose;
    activeModalClose = null;
    try { fn(); } catch { /* ignore cleanup error */ }
  }
  root.innerHTML = '';
}

export function openModal({ title, body = '', footer = '', size = '', onClose = null }) {
  closeModal();
  const root = document.getElementById('modal-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');

  const sizeClass = size === 'wide' ? 'wide' : size === 'xwide' ? 'xwide' : '';
  backdrop.innerHTML = `
    <div class="modal ${sizeClass}">
      <div class="modal-head">
        <h3>${esc(title)}</h3>
        <button type="button" class="btn btn-ghost btn-icon" data-modal-close aria-label="Cerrar">${icons.x}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>
  `;

  activeModalClose = () => {
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
  };

  const onKey = (e) => {
    if (e.key === 'Escape') closeModal();
  };
  document.addEventListener('keydown', onKey);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop || e.target.closest('[data-modal-close]')) closeModal();
  });

  root.appendChild(backdrop);
  return {
    root: backdrop,
    body: backdrop.querySelector('.modal-body'),
    footer: backdrop.querySelector('.modal-foot'),
    close: closeModal,
  };
}

export function confirmDialog({ title, message, confirmLabel = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (val) => {
      if (settled) return;
      settled = true;
      closeModal();
      resolve(val);
    };
    const modal = openModal({
      title,
      body: `<p>${esc(message)}</p>`,
      footer: `
        <button type="button" class="btn" data-cancel>Cancelar</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${esc(confirmLabel)}</button>
      `,
      onClose: () => {
        if (!settled) { settled = true; resolve(false); }
      },
    });
    modal.root.querySelector('[data-cancel]').addEventListener('click', () => finish(false));
    modal.root.querySelector('[data-confirm]').addEventListener('click', () => finish(true));
  });
}

// ── CSV download (UTF-8 BOM + spreadsheet formula injection safe) ────
function csvCell(val) {
  let s = String(val ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function downloadCsv(filename, headers, rows) {
  const lines = [headers.map(csvCell).join(';'), ...rows.map((r) => r.map(csvCell).join(';'))];
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'documento';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
