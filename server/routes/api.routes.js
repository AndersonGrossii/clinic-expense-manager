import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler as h } from '../utils/errors.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { requireClinic, validateUuidParams } from '../middlewares/clinic.middleware.js';
import { uploadSingle } from '../middlewares/upload.middleware.js';
import * as auth from '../controllers/auth.controller.js';
import * as c from '../controllers/api.controller.js';

export const api = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Demasiados intentos de acceso. Inténtelo de nuevo en 15 minutos.' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones, espere un momento.' },
});

api.use(apiLimiter);

// ── Public ───────────────────────────────────────────────────────────
api.get('/health', (req, res) => res.json({ ok: true }));
api.post('/auth/login', loginLimiter, h(auth.login));
api.post('/auth/logout', auth.logout);

// ── Authenticated (user scope) ───────────────────────────────────────
api.use(h(requireAuth));
api.get('/auth/me', auth.me);
api.get('/meta', c.meta);
api.get('/clinics', h(c.listClinics));
api.post('/clinics', h(c.createClinic));
api.patch('/clinics/:id', validateUuidParams('id'), h(c.updateClinic));

// ── Clinic scope: every route below requires X-Clinic-Id owned by the user ──
const clinic = Router();
clinic.use(h(requireClinic));
const id = validateUuidParams('id');

clinic.get('/dashboard', h(c.dashboard));

clinic.get('/folders', h(c.listFolders));
clinic.post('/folders', h(c.createFolder));
clinic.get('/folders/:id', id, h(c.getFolder));
clinic.patch('/folders/:id', id, h(c.updateFolder));
clinic.delete('/folders/:id', id, h(c.deleteFolder));

clinic.get('/documents', h(c.searchDocuments));
clinic.post('/documents', uploadSingle({ required: true }), h(c.createDocument));
clinic.get('/documents/:id', id, h(c.getDocument));
clinic.patch('/documents/:id', id, uploadSingle({ required: false }), h(c.updateDocument));
clinic.delete('/documents/:id', id, h(c.deleteDocument));
clinic.get('/documents/:id/file', id, h(c.downloadFile));

clinic.get('/workers', h(c.listWorkers));
clinic.post('/workers', h(c.createWorker));
clinic.patch('/workers/:id', id, h(c.updateWorker));
clinic.delete('/workers/:id', id, h(c.deleteWorker));

clinic.get('/nominas', h(c.listNominas));
clinic.post('/nominas', uploadSingle({ required: true }), h(c.createNomina));
clinic.patch('/nominas/:id', id, uploadSingle({ required: false }), h(c.updateNomina));
clinic.delete('/nominas/:id', id, h(c.deleteNomina));

clinic.get('/reports/iva', h(c.ivaReport));
clinic.get('/reports/spend', h(c.spendReport));

api.use(clinic);
