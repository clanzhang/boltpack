import { Parcel } from '@parcel/core';
import path from 'path';
import fs from 'node:fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import pc from 'picocolors';
import { cleanOutDir } from './clean.js';
import { logger } from './utils/logger.js';
import { getCustomConfigPath } from './config-loader.js';
import { generateDeclarations } from './typecheck.js';
import { ensureAtomicCssPostCss } from './atomic-css.js';

const require = createRequire(import.meta.url);
const { setAliasConfig } = require('./parcel-config/resolver-alias.cjs');

process.env.NODE_ENV = 'production';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LIB_ENTRY_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);

function copyPublicDir(publicDir, outDir) {
  const src = path.resolve(process.cwd(), publicDir);
  const dest = path.resolve(process.cwd(), outDir);
  if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) return false;
  fs.cpSync(src, dest, { recursive: true });
  return true;
}

function assertLibEntry(entry) {
  const ext = path.extname(entry).toLowerCase();
  if (!LIB_ENTRY_EXTS.has(ext)) {
    throw new Error(
      `Library mode requires a JS/TS entry (got "${entry}"). ` +
      `Remove --lib for HTML-driven app builds, or pass a .ts/.js entry.`
    );
  }
}

function buildLibOptions({ entryFilePath, outDirPath, noCache, isProduction }) {
  // Dual-target: CJS (main) + ESM (module), scope-hoisted, sourcemapped.
  return {
    entries: entryFilePath,
    config: path.resolve(__dirname, '..', 'node_modules', '@parcel', 'config-default'),
    mode: isProduction ? 'production' : 'development',
    outDir: outDirPath,
    shouldDisableCache: noCache,
    env: { NODE_ENV: isProduction ? 'production' : 'development' },
    targets: {
      main: {
        outputFormat: 'commonjs',
        distDir: outDirPath,
        sourceMap: true,
        scopeHoist: true,
      },
      module: {
        outputFormat: 'esmodule',
        distDir: outDirPath,
        sourceMap: true,
        scopeHoist: true,
      },
    },
    defaultTargetOptions: {
      engines: { browsers: ['> 0.5%', 'last 2 versions', 'not dead'] },
    },
  };
}

function buildAppOptions({ entryFilePath, outDirPath, noCache, isProduction, alias, configPath }) {
  return {
    entries: entryFilePath,
    config: configPath,
    mode: isProduction ? 'production' : 'development',
    outDir: outDirPath,
    shouldDisableCache: noCache,
    env: { NODE_ENV: isProduction ? 'production' : 'development' },
    targets: { browser: { distDir: outDirPath } },
    defaultTargetOptions: {
      engines: { browsers: ['> 0.5%', 'last 2 versions', 'not dead'] },
    },
  };
}

export async function build({
  entry,
  mode,
  outDir,
  noCache = false,
  analyze = false,
  publicDir = 'public',
  alias = {},
  lib = false,
}) {
  const startTime = Date.now();
  const projectRoot = process.cwd();
  const entryFilePath = path.resolve(projectRoot, entry);
  const outDirPath = path.resolve(projectRoot, outDir);
  const isProduction = mode === 'production';

  if (lib) {
    assertLibEntry(entry);
  } else {
    // Atomic CSS auto-wire only relevant for app builds
    ensureAtomicCssPostCss(projectRoot);
  }

  const hasAlias = !lib && alias && Object.keys(alias).length > 0;
  if (hasAlias) setAliasConfig(alias, projectRoot);
  const configPath = getCustomConfigPath(alias);

  cleanOutDir(outDir);

  const options = lib
    ? buildLibOptions({ entryFilePath, outDirPath, noCache, isProduction })
    : buildAppOptions({ entryFilePath, outDirPath, noCache, isProduction, alias, configPath });

  if (analyze && isProduction && !lib) {
    options.additionalReporters = [{
      packageName: '@parcel/reporter-bundle-analyzer',
      resolveFrom: fileURLToPath(import.meta.url),
    }];
    logger.info('analyze enabled — report opens in browser after build');
  } else if (analyze && !isProduction) {
    logger.warn('--analyze is production-only, skipping');
  }

  if (hasAlias) {
    logger.kv('alias', Object.entries(alias).map(([k, v]) => `${k}→${v}`).join(' '));
  }

  const bundler = new Parcel(options);
  const { bundleGraph } = await bundler.run();

  const assets = [];
  bundleGraph.getBundles().forEach(bundle => {
    assets.push(path.relative(projectRoot, bundle.filePath));
  });

  // ── Library mode: emit .d.ts via tsc --emitDeclarationOnly ──
  if (lib) {
    const decl = await generateDeclarations(projectRoot, outDir);
    if (decl.ok) {
      logger.success('Type declarations emitted');
    } else if (decl.reason === 'no tsconfig.json') {
      logger.warn('skipped .d.ts: no tsconfig.json found');
    } else {
      logger.warn('type declaration generation had errors');
    }
  } else if (publicDir && copyPublicDir(publicDir, outDir)) {
    logger.success(`static assets (${publicDir}) copied`);
  }

  return { time: Date.now() - startTime, assets };
}
