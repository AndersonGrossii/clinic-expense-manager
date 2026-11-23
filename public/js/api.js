let getClinicId = () => null;
const activeBlobUrls = new Set();

export function setClinicIdGetter(fn) {
  getClinicId = fn;
}

export function revokeAllBlobUrls() {
  for (const url of activeBlobUrls) {
    try { URL.revokeObjectURL(url); } catch { /* ignore */ }
  }
  activeBlobUrls.clear();
}

export function revokeBlobUrl(url) {
  if (!url) return;
  try { URL.revokeObjectURL(url); } catch { /* ignore */ }
  activeBlobUrls.delete(url);
}

async function request(method, path, body, opts = {}) {
  const headers = {};
  if (opts.clinicScoped !== false) {
    const cid = getClinicId();
    if (cid) headers['X-Clinic-Id'] = cid;
  }

  let payload;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers,
    body: payload,
  });

  if (res.status === 401 && !opts.noRedirect) {
    window.location.replace('/login.html');
    throw new Error('Sesión expirada');
  }

  if (res.status === 204) return null;

  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const err = new Error(data?.error || `Error ${res.status}`);
    err.status = res.status;
    err.details = data?.details;
    throw err;
  }
  return data;
}

export const api = {
  get: (path, opts) => request('GET', path, undefined, opts),
  post: (path, body, opts) => request('POST', path, body, opts),
  patch: (path, body, opts) => request('PATCH', path, body, opts),
  del: (path, opts) => request('DELETE', path, undefined, opts),

  async fetchFileBlob(docId, { download = false } = {}) {
    const headers = {};
    const cid = getClinicId();
    if (cid) headers['X-Clinic-Id'] = cid;

    const res = await fetch(`/api/documents/${encodeURIComponent(docId)}/file${download ? '?download=1' : ''}`, {
      method: 'GET',
      credentials: 'same-origin',
      headers,
    });
    if (res.status === 401) {
      window.location.replace('/login.html');
      throw new Error('Sesión expirada');
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || 'No se pudo cargar el archivo');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    activeBlobUrls.add(url);
    return { blob, url, mime: res.headers.get('content-type') || blob.type };
  },
};
