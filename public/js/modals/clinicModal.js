import { api } from '../api.js';
import { CLINIC_COLORS, esc, openModal, toast } from '../ui.js';

export function openClinicModal({ clinic = null, onSaved } = {}) {
  const isEdit = Boolean(clinic);
  const selectedColor = clinic?.color || CLINIC_COLORS[0];

  const modal = openModal({
    title: isEdit ? 'Editar clínica' : 'Nueva clínica',
    body: `
      <form id="clinic-form" class="form-grid" novalidate>
        <div id="clinic-err" class="form-error full" hidden></div>
        <div class="field full">
          <label for="cl-name">Nombre de la clínica *</label>
          <input id="cl-name" class="input" required maxlength="150"
            value="${esc(clinic?.name || '')}" placeholder="Ej. Clínica Dental Norte">
        </div>
        <div class="field">
          <label for="cl-cif">CIF / NIF</label>
          <input id="cl-cif" class="input" maxlength="50"
            value="${esc(clinic?.tax_id_cif || '')}" placeholder="Ej. B12345678">
        </div>
        <div class="field">
          <label for="cl-color">Color identificador</label>
          <input id="cl-color" type="hidden" value="${esc(selectedColor)}">
          <div id="cl-swatches" class="row">
            ${CLINIC_COLORS.map((c) => `
              <button type="button" class="btn btn-sm ${c === selectedColor ? 'btn-primary' : ''}" data-color="${esc(c)}" aria-label="Color ${esc(c)}">
                <span class="badge"><span class="dot"></span></span>
              </button>
            `).join('')}
          </div>
        </div>
        <div class="field full">
          <label for="cl-addr">Dirección</label>
          <input id="cl-addr" class="input" maxlength="500"
            value="${esc(clinic?.address || '')}" placeholder="Calle, ciudad…">
        </div>
      </form>
      ${!isEdit ? '<p class="muted mt">Se crearán automáticamente las carpetas iniciales: Facturas Agua, Facturas Compras, Nóminas y Gastos Generales.</p>' : ''}
    `,
    footer: `
      <button type="button" class="btn" data-modal-close>Cancelar</button>
      <button type="submit" form="clinic-form" id="clinic-submit" class="btn btn-primary">${isEdit ? 'Guardar' : 'Crear clínica'}</button>
    `,
  });

  const form = modal.body.querySelector('#clinic-form');
  const errBox = modal.body.querySelector('#clinic-err');
  const colorInput = modal.body.querySelector('#cl-color');
  const submitBtn = modal.footer.querySelector('#clinic-submit');

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
    const payload = {
      name: modal.body.querySelector('#cl-name').value.trim(),
      tax_id_cif: modal.body.querySelector('#cl-cif').value.trim(),
      address: modal.body.querySelector('#cl-addr').value.trim(),
      color: colorInput.value,
    };

    submitBtn.disabled = true;
    try {
      const saved = isEdit
        ? await api.patch(`/clinics/${clinic.id}`, payload, { clinicScoped: false })
        : await api.post('/clinics', payload, { clinicScoped: false });
      toast(isEdit ? 'Clínica actualizada' : 'Clínica creada con carpetas iniciales');
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
