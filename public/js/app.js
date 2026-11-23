import { api } from './api.js';
import {
  state, getActiveClinic, setActiveClinic, refreshClinics,
  onClinicChange, parseHash, navigate,
} from './state.js';
import { esc, initials, icons, toast } from './ui.js';
import { openClinicModal } from './modals/clinicModal.js';
import { openDocumentModal } from './modals/documentModal.js';
import { renderDashboardView } from './views/dashboardView.js';
import { renderFoldersView } from './views/foldersView.js';
import { renderSearchView } from './views/searchView.js';
import { renderNominasView } from './views/nominasView.js';
import { renderReportsView } from './views/reportsView.js';

const VIEW_META = {
  dashboard: { title: 'Panel principal', subtitle: 'Gastos, IVA y evolución por clínica', render: renderDashboardView },
  folders: { title: 'Carpetas y facturas', subtitle: 'Organiza documentos y fotos por categoría', render: renderFoldersView },
  search: { title: 'Buscar documentos', subtitle: 'Filtra por nombre, fecha, tipo o carpeta', render: renderSearchView },
  nominas: { title: 'Nóminas', subtitle: 'Trabajadores y costes salariales (IVA 0%)', render: renderNominasView },
  reports: { title: 'Informes contables', subtitle: 'Gastos anuales e IVA trimestral', render: renderReportsView },
};

const viewEl = document.getElementById('view');
const titleEl = document.getElementById('page-title');
const subtitleEl = document.getElementById('page-subtitle');
const switcherBtn = document.getElementById('clinic-switcher-btn');
const dropdownEl = document.getElementById('clinic-dropdown');
const avatarEl = document.getElementById('active-clinic-avatar');
const clinicNameEl = document.getElementById('active-clinic-name');
const sidebarEl = document.getElementById('sidebar');
const sidebarBackdropEl = document.getElementById('sidebar-backdrop');
const sidebarCloseBtn = document.getElementById('sidebar-close');
const menuToggleBtn = document.getElementById('menu-toggle');

function setSidebarOpen(open) {
  sidebarEl.classList.toggle('open', open);
  sidebarBackdropEl.hidden = !open;
  document.body.classList.toggle('drawer-open', open);
  menuToggleBtn.setAttribute('aria-expanded', String(open));
}

function renderClinicSwitcher() {
  const active = getActiveClinic();
  if (!active) {
    avatarEl.textContent = '+';
    avatarEl.style.backgroundColor = '#64748B';
    clinicNameEl.textContent = 'Sin clínica';
  } else {
    avatarEl.textContent = initials(active.name);
    avatarEl.style.backgroundColor = active.color || '#0EA5E9';
    clinicNameEl.textContent = active.name;
  }

  dropdownEl.innerHTML = `
    ${state.clinics.map((c) => `
      <button type="button" class="item ${c.id === active?.id ? 'active' : ''}" data-pick-clinic="${esc(c.id)}" role="menuitem">
        <span class="clinic-avatar" data-ccolor="${esc(c.color)}">${esc(initials(c.name))}</span>
        <span>
          <strong>${esc(c.name)}</strong>
          <small>${c.document_count} documento(s)${c.tax_id_cif ? ` · ${esc(c.tax_id_cif)}` : ''}</small>
        </span>
      </button>
    `).join('')}
    <hr>
    ${active ? `<button type="button" class="item" id="edit-active-clinic">${icons.edit}<span>Editar clínica actual</span></button>` : ''}
    <button type="button" class="item" id="create-new-clinic">${icons.plus}<span>Crear nueva clínica</span></button>
  `;

  for (const av of dropdownEl.querySelectorAll('.clinic-avatar[data-ccolor]')) {
    av.style.backgroundColor = av.dataset.ccolor || '#0EA5E9';
  }

  for (const btn of dropdownEl.querySelectorAll('[data-pick-clinic]')) {
    btn.addEventListener('click', () => {
      dropdownEl.hidden = true;
      switcherBtn.setAttribute('aria-expanded', 'false');
      setActiveClinic(btn.dataset.pickClinic);
    });
  }

  dropdownEl.querySelector('#edit-active-clinic')?.addEventListener('click', () => {
    dropdownEl.hidden = true;
    switcherBtn.setAttribute('aria-expanded', 'false');
    openClinicModal({
      clinic: getActiveClinic(),
      onSaved: async (saved) => {
        await refreshClinics();
        setActiveClinic(saved.id, { silent: true });
        renderClinicSwitcher();
        renderCurrentRoute();
      },
    });
  });

  dropdownEl.querySelector('#create-new-clinic')?.addEventListener('click', () => {
    dropdownEl.hidden = true;
    switcherBtn.setAttribute('aria-expanded', 'false');
    openClinicModal({
      onSaved: async (saved) => {
        await refreshClinics();
        setActiveClinic(saved.id);
      },
    });
  });
}

let renderSeq = 0;

async function renderCurrentRoute() {
  const seq = ++renderSeq;
  const { view, params } = parseHash();
  const route = VIEW_META[view] || VIEW_META.dashboard;
  const routeKey = VIEW_META[view] ? view : 'dashboard';

  titleEl.textContent = route.title;
  subtitleEl.textContent = route.subtitle;

  for (const link of document.querySelectorAll('[data-route]')) {
    link.classList.toggle('active', link.dataset.route === routeKey);
  }
  setSidebarOpen(false);

  if (!state.clinics.length) {
    viewEl.innerHTML = `
      <div class="card empty">
        ${icons.building}
        <h3>Crea tu primera clínica para empezar</h3>
        <p>Cada clínica mantiene sus propias carpetas, recibos, nóminas e informes totalmente aislados.</p>
        <button id="empty-create-clinic" type="button" class="btn btn-primary mt">${icons.plus}<span>Crear clínica</span></button>
      </div>
    `;
    viewEl.querySelector('#empty-create-clinic').addEventListener('click', () => {
      openClinicModal({
        onSaved: async (saved) => {
          await refreshClinics();
          setActiveClinic(saved.id);
        },
      });
    });
    return;
  }

  viewEl.innerHTML = '<div class="spinner" aria-label="Cargando"></div>';
  await route.render(viewEl, params);
  if (seq !== renderSeq) return;
}

async function init() {
  try {
    const [{ user }, meta] = await Promise.all([
      api.get('/auth/me', { clinicScoped: false }),
      api.get('/meta', { clinicScoped: false }),
    ]);
    state.user = user;
    state.meta = meta;

    document.getElementById('user-name').textContent = user.full_name;
    document.getElementById('user-email').textContent = user.email;

    await refreshClinics();
    renderClinicSwitcher();
  } catch (err) {
    toast(err.message || 'No se pudo inicializar la aplicación', 'error');
    return;
  }

  onClinicChange(() => {
    renderClinicSwitcher();
    renderCurrentRoute();
  });

  // Clinic switcher dropdown toggle
  switcherBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = dropdownEl.hidden;
    dropdownEl.hidden = !open;
    switcherBtn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#clinic-switcher')) {
      dropdownEl.hidden = true;
      switcherBtn.setAttribute('aria-expanded', 'false');
    }
  });

  // Quick upload button
  document.getElementById('quick-upload-btn').addEventListener('click', () => {
    if (!state.activeClinicId) {
      toast('Crea una clínica antes de subir documentos', 'error');
      return;
    }
    const { view, params } = parseHash();
    openDocumentModal({
      defaultFolderId: view === 'folders' ? params.id || null : null,
      onSaved: () => {
        refreshClinics().then(renderClinicSwitcher).catch(() => {});
        renderCurrentRoute();
      },
    });
  });

  // Mobile / tablet drawer toggle
  menuToggleBtn.addEventListener('click', () => {
    setSidebarOpen(!sidebarEl.classList.contains('open'));
  });
  sidebarCloseBtn.addEventListener('click', () => setSidebarOpen(false));
  sidebarBackdropEl.addEventListener('click', () => setSidebarOpen(false));
  for (const link of sidebarEl.querySelectorAll('.nav a')) {
    link.addEventListener('click', () => setSidebarOpen(false));
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebarEl.classList.contains('open')) setSidebarOpen(false);
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', async () => {
    try {
      await api.post('/auth/logout', {}, { clinicScoped: false, noRedirect: true });
    } finally {
      window.location.replace('/login.html');
    }
  });

  window.addEventListener('hashchange', renderCurrentRoute);
  await renderCurrentRoute();
}

init();
