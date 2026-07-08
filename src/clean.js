import fs from 'node:fs';
import path from 'node:path';
import { logger } from './utils/logger.js';

const PARCEL_CACHE_DIR = '.parcel-cache';

export function clean({ outDir = 'dist' } = {}) {
  const cacheDir = path.resolve(process.cwd(), PARCEL_CACHE_DIR);
  const distDir = path.resolve(process.cwd(), outDir);

  const removed = [];

  try {
    if (fs.existsSync(cacheDir)) {
      fs.rmSync(cacheDir, { recursive: true, force: true });
      removed.push('.parcel-cache');
    }
  } catch {}

  try {
    if (fs.existsSync(distDir)) {
      fs.rmSync(distDir, { recursive: true, force: true });
      removed.push(outDir);
    }
  } catch {}

  if (removed.length > 0) {
    logger.success('Cleaned');
    removed.forEach(item => logger.detail(item));
  } else {
    logger.info('Already clean — nothing to do');
  }
}

export function cleanOutDir(outDir) {
  const distDir = path.resolve(process.cwd(), outDir);
  try {
    fs.rmSync(distDir, { recursive: true, force: true });
  } catch {}
}
