import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config/env.js';
import { api } from './routes/api.routes.js';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.isProduction) app.set('trust proxy', 1); // Railway / reverse proxy

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'"],
        'img-src': ["'self'", 'blob:', 'data:'],
        'frame-src': ["'self'", 'blob:'],
        'object-src': ["'self'", 'blob:'],
        'connect-src': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        ...(config.isProduction ? {} : { 'upgrade-insecure-requests': null }),
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());

  // API responses are never cached
  app.use('/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); }, api);
  app.use('/api', notFoundHandler);

  // Static frontend (no uploaded files live here)
  app.use(express.static(PUBLIC_DIR, { index: 'index.html', extensions: ['html'], maxAge: config.isProduction ? '1h' : 0 }));
  app.get('*', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

  app.use(errorHandler);
  return app;
}
