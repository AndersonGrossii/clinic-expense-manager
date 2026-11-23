import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { config } from '../config/env.js';
import { ALLOWED_UPLOADS } from '../utils/constants.js';
import { STORAGE_ROOT, newRelativePath, ensureDirFor, removeAbsolute } from '../config/storage.js';
import { HttpError } from '../utils/errors.js';

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const ext = path.extname(file.originalname).slice(1).toLowerCase();
      file.relativePath = newRelativePath(req.clinicId, ext);
      const abs = path.join(STORAGE_ROOT, file.relativePath);
      await ensureDirFor(abs);
      file.absPath = abs;
      cb(null, path.dirname(abs));
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => cb(null, path.basename(file.absPath)),
});

const multerUpload = multer({
  storage,
  limits: { fileSize: config.maxUploadBytes, files: 1, fields: 30 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).slice(1).toLowerCase();
    if (!ALLOWED_UPLOADS[ext]) {
      return cb(new HttpError(415, 'Tipo de archivo no permitido (PDF, JPG, PNG, WEBP, HEIC)'));
    }
    cb(null, true);
  },
});

/** Detect real file type from its first bytes (magic numbers). */
export function detectMime(buf) {
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buf.length >= 12 && buf.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('latin1');
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis'].includes(brand)) return 'image/heic';
    if (['mif1', 'msf1'].includes(brand)) return 'image/heif';
  }
  return null;
}

const COMPATIBLE = {
  'image/heic': ['image/heic', 'image/heif'],
  'image/heif': ['image/heic', 'image/heif'],
};

/**
 * Accepts a single optional/required file field named "file", then verifies magic bytes match
 * the extension. Invalid files are deleted immediately.
 */
export function uploadSingle({ required = true } = {}) {
  return (req, res, next) => {
    multerUpload.single('file')(req, res, async (err) => {
      if (err) {
        if (req.file?.absPath) await removeAbsolute(req.file.absPath);
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return next(new HttpError(413, `El archivo supera ${Math.round(config.maxUploadBytes / 1048576)} MB`));
          }
          return next(new HttpError(400, `Error de subida: ${err.code}`));
        }
        return next(err);
      }
      if (!req.file) {
        return required ? next(new HttpError(400, 'Debe adjuntar un archivo (foto o PDF)')) : next();
      }
      try {
        const fh = await fs.open(req.file.absPath, 'r');
        const buf = Buffer.alloc(16);
        await fh.read(buf, 0, 16, 0);
        await fh.close();
        const ext = path.extname(req.file.originalname).slice(1).toLowerCase();
        const declared = ALLOWED_UPLOADS[ext];
        const real = detectMime(buf);
        const ok = real && (real === declared || (COMPATIBLE[declared] || []).includes(real));
        if (!ok) {
          await removeAbsolute(req.file.absPath);
          return next(new HttpError(415, 'El contenido del archivo no coincide con su extensión'));
        }
        req.file.detectedMime = real;
        next();
      } catch (e) {
        await removeAbsolute(req.file.absPath);
        next(e);
      }
    });
  };
}

/** Cleanup helper for controllers when a later step fails. */
export async function discardUpload(req) {
  if (req.file?.absPath) await removeAbsolute(req.file.absPath);
}
