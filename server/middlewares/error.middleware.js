import { config } from '../config/env.js';
import { discardUpload } from './upload.middleware.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Ruta no encontrada' });
}

// eslint-disable-next-line no-unused-vars
export async function errorHandler(err, req, res, next) {
  await discardUpload(req).catch(() => {});

  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Error interno';
  let details = err.details;

  // PostgreSQL errors → friendly messages
  if (err.code && /^[0-9A-Z]{5}$/.test(err.code)) {
    if (err.code === '23505') { status = 409; message = 'Ya existe un registro con esos datos'; }
    else if (err.code === '23503') { status = 409; message = 'El registro está en uso o referencia datos inexistentes'; }
    else if (err.code === '23514') { status = 400; message = 'Los datos no cumplen las reglas contables'; }
    else if (err.code === '22P02' || err.code === '22007' || err.code === '22008') { status = 400; message = 'Formato de dato no válido'; }
    else { status = 500; }
    details = undefined;
  }
  if (err.type === 'entity.parse.failed') { status = 400; message = 'JSON no válido'; }
  if (err.type === 'entity.too.large') { status = 413; message = 'Petición demasiado grande'; }

  if (status >= 500) {
    console.error('[error]', err);
    if (config.isProduction) message = 'Error interno del servidor';
  }
  res.status(status).json({ error: message, ...(details ? { details } : {}) });
}
