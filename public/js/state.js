import { api, setClinicIdGetter, revokeAllBlobUrls } from './api.js';

const STORAGE_KEY = 'ce_clinic_id';

export const state = {
  user: null,
  meta: { billTypes: [], ivaRates: [0, 4, 5, 10, 21], maxUploadMb: 15, allowedExtensions: [] },
  clinics: [],
  activeClinicId: localStorage.getItem(STORAGE_KEY) || null,
  folders: [],
  workers: [],
};

setClinicIdGetter(() => state.activeClinicId);

const listeners = new Set();

export function onClinicChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getActiveClinic() {
  return state.clinics.find((c) => c.id === state.activeClinicId) || state.clinics[0] || null;
}

export function applyClinicTheme(clinic) {
  document.documentElement.style.setProperty('--clinic-color', clinic?.color || '#0EA5E9');
}

export function setActiveClinic(id, { silent = false } = {}) {
  const target = state.clinics.find((c) => c.id === id) || state.clinics[0] || null;
  const nextId = target?.id || null;
  const changed = nextId !== state.activeClinicId;

  state.activeClinicId = nextId;
  if (nextId) localStorage.setItem(STORAGE_KEY, nextId);
  else localStorage.removeItem(STORAGE_KEY);

  applyClinicTheme(target);

  if (changed) {
    state.folders = [];
    state.workers = [];
    revokeAllBlobUrls();
  }

  if (!silent) {
    for (const fn of listeners) fn(target);
  }
  return target;
}

export async function refreshClinics() {
  const clinics = await api.get('/clinics', { clinicScoped: false });
  state.clinics = clinics;
  const current = state.clinics.find((c) => c.id === state.activeClinicId);
  setActiveClinic(current ? current.id : state.clinics[0]?.id || null, { silent: true });
  return clinics;
}

export async function loadFolders(force = false) {
  if (!state.activeClinicId) return [];
  if (state.folders.length && !force) return state.folders;
  state.folders = await api.get('/folders');
  return state.folders;
}

export async function loadWorkers(force = false) {
  if (!state.activeClinicId) return [];
  if (state.workers.length && !force) return state.workers;
  state.workers = await api.get('/workers');
  return state.workers;
}

export function billTypeLabel(code) {
  return state.meta.billTypes.find((t) => t.code === code)?.label || code;
}

// ── Hash router helpers ──────────────────────────────────────────────
export function parseHash() {
  const raw = (window.location.hash || '#dashboard').slice(1);
  const qIdx = raw.indexOf('?');
  const view = (qIdx >= 0 ? raw.slice(0, qIdx) : raw) || 'dashboard';
  const params = {};
  if (qIdx >= 0) {
    const sp = new URLSearchParams(raw.slice(qIdx + 1));
    for (const [k, v] of sp.entries()) {
      if (v !== '') params[k] = v;
    }
  }
  return { view, params };
}

export function buildHash(view, params = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const qs = sp.toString();
  return `#${view}${qs ? `?${qs}` : ''}`;
}

export function navigate(view, params = {}) {
  const nextHash = buildHash(view, params);
  if (window.location.hash === nextHash) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = nextHash;
  }
}
