// src/server/upload.ts
import type { Express, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { log } from '@/lib/log';

const DATA_BRAND_DIR = path.resolve(process.cwd(), 'data', 'brand');
const CUSTOM_LOGO_PATH = path.join(DATA_BRAND_DIR, 'logo.png');
const DEFAULT_LOGO_PATH = path.resolve(process.cwd(), 'public', 'brand', 'logo.png');

/** Risolve il path del logo: custom caricato → default pubblico. */
export function resolveLogoPath(customPath = CUSTOM_LOGO_PATH): string {
  return fs.existsSync(customPath) ? customPath : DEFAULT_LOGO_PATH;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(DATA_BRAND_DIR, { recursive: true });
    cb(null, DATA_BRAND_DIR);
  },
  filename: (_req, _file, cb) => cb(null, 'logo.png'),
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/svg+xml'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Formato non supportato: usa PNG, JPG o SVG'));
  },
});

export function mountUploadRoutes(app: Express): void {
  app.post('/api/brand/logo', upload.single('logo'), (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) { res.status(400).json({ error: 'nessun file' }); return; }
      log.info('brand.logo.uploaded', { size: req.file.size });
      res.json({ ok: true, path: CUSTOM_LOGO_PATH });
    } catch (err) { next(err); }
  });

  app.get('/api/brand/logo', (_req, res) => {
    const logoPath = resolveLogoPath();
    if (!fs.existsSync(logoPath)) { res.status(404).json({ error: 'logo_not_found' }); return; }
    const ext = path.extname(logoPath).slice(1).toLowerCase();
    const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'png' ? 'image/png' : 'image/jpeg';
    res.setHeader('Content-Type', mime);
    res.sendFile(logoPath);
  });
}
