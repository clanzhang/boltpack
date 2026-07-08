import { Parcel } from '@parcel/core';
import path from 'path';
import fs from 'node:fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { cleanOutDir } from './clean.js';
import { logger } from './utils/logger.js';
import { getCustomConfigPath } from './config-loader.js';

const require = createRequire(import.meta.url);
const { setAliasConfig } = require('./parcel-config/resolver-alias.cjs');

process.env.NODE_ENV = 'production';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function copyPublicDir(publicDir, outDir) {
  const src = path.resolve(process.cwd(), publicDir);
  const dest = path.resolve(process.cwd(), outDir);

  if (!fs.existsSync(src)) {
    return false;
  }

  const stat = fs.statSync(src);
  if (!stat.isDirectory()) {
    return false;
  }

  fs.cpSync(src, dest, { recursive: true });
  return true;
}

export async function build({ entry, mode, outDir, noCache = false, analyze = false, publicDir = 'public', alias = {} }) {
  const startTime = Date.now();
  const projectRoot = process.cwd();

  const entryFilePath = path.resolve(projectRoot, entry);
  const outDirPath = path.resolve(projectRoot, outDir);

  const hasAlias = alias && Object.keys(alias).length > 0;

  if (hasAlias) {
    setAliasConfig(alias, projectRoot);
  }

  const configPath = getCustomConfigPath(alias);

  cleanOutDir(outDir);

  const isProduction = mode === 'production';

  const options = {
    entries: entryFilePath,
    config: configPath,
    mode: isProduction ? 'production' : 'development',
    outDir: outDirPath,
    shouldDisableCache: noCache,
    env: {
      NODE_ENV: isProduction ? 'production' : 'development',
    },
    targets: {
      browser: {
        distDir: outDirPath
      }
    },
    defaultTargetOptions: {
      engines: {
        browsers: ['> 0.5%', 'last 2 versions', 'not dead']
      }
    }
  };

  if (analyze && isProduction) {
    options.additionalReporters = [
      {
        packageName: '@parcel/reporter-bundle-analyzer',
        resolveFrom: fileURLToPath(import.meta.url),
      },
    ];
    logger.info('📊 Bundle analysis enabled — report will open in browser after build');
  } else if (analyze && !isProduction) {
    logger.warning('⚠️  --analyze is recommended for production mode only, skipping');
  }

  if (hasAlias) {
    logger.info(`🔗 Alias: ${Object.entries(alias).map(([k, v]) => `${k} → ${v}`).join(', ')}`);
  }

  const bundler = new Parcel(options);

  const { bundleGraph } = await bundler.run();

  const assets = [];
  bundleGraph.getBundles().forEach(bundle => {
    assets.push(path.relative(projectRoot, bundle.filePath));
  });

  if (publicDir && copyPublicDir(publicDir, outDir)) {
    logger.success(`📁 Static assets (${publicDir}) copied to output directory`);
  }

  return {
    time: Date.now() - startTime,
    assets
  };
}
