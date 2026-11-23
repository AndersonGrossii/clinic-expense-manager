import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';
import * as clinics from '../services/clinic.service.js';
import * as folders from '../services/folder.service.js';
import * as docs from '../services/document.service.js';
import * as payroll from '../services/payroll.service.js';
import * as reports from '../services/report.service.js';
import { resolveStored } from '../config/storage.js';
import { BILL_TYPES, IVA_RATES } from '../utils/constants.js';
import { notFound } from '../utils/errors.js';
import { config } from '../config/env.js';
import {
  parse, clinicCreateSchema, clinicUpdateSchema, folderCreateSchema, folderUpdateSchema,
  documentCreateSchema, documentUpdateSchema, documentSearchSchema, periodSchema,
  workerCreateSchema, workerUpdateSchema, nominaCreateSchema, nominaUpdateSchema,
} from '../validators/index.js';

// ── Meta ─────────────────────────────────────────────────────────────
export const meta = (req, res) => res.json({
  billTypes: BILL_TYPES,
  ivaRates: IVA_RATES,
  maxUploadMb: Math.round(config.maxUploadBytes / 1048576),
  allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'],
});

// ── Clinics (scoped by owner, not by X-Clinic-Id) ────────────────────
export const listClinics = async (req, res) => res.json(await clinics.listClinics(req.user.id));
export const createClinic = async (req, res) =>
  res.status(201).json(await clinics.createClinic(req.user.id, parse(clinicCreateSchema, req.body)));
export const updateClinic = async (req, res) =>
  res.json(await clinics.updateClinic(req.user.id, req.params.id, parse(clinicUpdateSchema, req.body)));

// ── Folders ──────────────────────────────────────────────────────────
export const listFolders = async (req, res) => res.json(await folders.listFolders(req.clinicId));
export const getFolder = async (req, res) => res.json(await folders.getFolder(req.clinicId, req.params.id));
export const createFolder = async (req, res) =>
  res.status(201).json(await folders.createFolder(req.clinicId, parse(folderCreateSchema, req.body)));
export const updateFolder = async (req, res) =>
  res.json(await folders.updateFolder(req.clinicId, req.params.id, parse(folderUpdateSchema, req.body)));
export const deleteFolder = async (req, res) => {
  await folders.deleteFolder(req.clinicId, req.params.id);
  res.status(204).end();
};

// ── Documents ────────────────────────────────────────────────────────
export const searchDocuments = async (req, res) =>
  res.json(await docs.searchDocuments(req.clinicId, parse(documentSearchSchema, req.query)));
export const getDocument = async (req, res) =>
  res.json(docs.publicDoc(await docs.getDocument(req.clinicId, req.params.id)));
export const createDocument = async (req, res) =>
  res.status(201).json(await docs.createDocument(req.clinicId, req.user.id, parse(documentCreateSchema, req.body), req.file));
export const updateDocument = async (req, res) =>
  res.json(await docs.updateDocument(req.clinicId, req.params.id, parse(documentUpdateSchema, req.body), req.file));
export const deleteDocument = async (req, res) => {
  await docs.deleteDocument(req.clinicId, req.params.id);
  res.status(204).end();
};

export const downloadFile = async (req, res) => {
  const doc = await docs.getDocument(req.clinicId, req.params.id);
  const abs = resolveStored(req.clinicId, doc.file_path);
  if (!fs.existsSync(abs)) throw notFound('Archivo no disponible');
  const safeName = path.basename(doc.file_original_name).replace(/[^\w.\- ]+/g, '_');
  const disposition = req.query.download === '1' ? 'attachment' : 'inline';
  res.setHeader('Content-Type', doc.file_mime_type);
  res.setHeader('Content-Disposition', `${disposition}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(doc.file_original_name)}`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  fs.createReadStream(abs).pipe(res);
};

// ── Workers & Nóminas ────────────────────────────────────────────────
export const listWorkers = async (req, res) => res.json(await payroll.listWorkers(req.clinicId));
export const createWorker = async (req, res) =>
  res.status(201).json(await payroll.createWorker(req.clinicId, parse(workerCreateSchema, req.body)));
export const updateWorker = async (req, res) =>
  res.json(await payroll.updateWorker(req.clinicId, req.params.id, parse(workerUpdateSchema, req.body)));
export const deleteWorker = async (req, res) => {
  await payroll.deleteWorker(req.clinicId, req.params.id);
  res.status(204).end();
};

export const listNominas = async (req, res) => {
  const q = parse(periodSchema, req.query);
  const workerId = typeof req.query.workerId === 'string' && req.query.workerId ? req.query.workerId : undefined;
  res.json(await payroll.listNominas(req.clinicId, { year: q.year, workerId: workerId && parse(workerFilter, { workerId }).workerId }));
};
const workerFilter = z.object({ workerId: z.string().uuid() });

export const createNomina = async (req, res) =>
  res.status(201).json(await payroll.createNomina(req.clinicId, req.user.id, parse(nominaCreateSchema, req.body), req.file));
export const updateNomina = async (req, res) =>
  res.json(await payroll.updateNomina(req.clinicId, req.params.id, parse(nominaUpdateSchema, req.body), req.file));
export const deleteNomina = async (req, res) => {
  await payroll.deleteNomina(req.clinicId, req.params.id);
  res.status(204).end();
};

// ── Dashboard & Reports ──────────────────────────────────────────────
export const dashboard = async (req, res) => {
  const q = parse(periodSchema, req.query);
  res.json(await reports.getDashboard(req.clinicId, q));
};
export const ivaReport = async (req, res) => {
  const { year = new Date().getFullYear() } = parse(periodSchema, req.query);
  res.json(await reports.getIvaReport(req.clinicId, year));
};
export const spendReport = async (req, res) => {
  const { year = new Date().getFullYear() } = parse(periodSchema, req.query);
  res.json(await reports.getSpendReport(req.clinicId, year));
};
