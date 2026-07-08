import { Parcel } from '@parcel/core';
import path from 'path';
import { fileURLToPath } from 'url';
import { cleanOutDir } from './clean.js';
import { logger } from './utils/logger.js';

// 强制注入生产环境变量，确保 React/Vue 等库走 production 分支（dead code elimination）
process.env.NODE_ENV = 'production';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function build({ entry, mode, outDir, noCache = false, analyze = false }) {
  const startTime = Date.now();

  const entryFilePath = path.resolve(process.cwd(), entry);
  const outDirPath = path.resolve(process.cwd(), outDir);

  const configPath = path.resolve(__dirname, '..', 'node_modules', '@parcel', 'config-default');

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

  // 零配置注入 bundle analyzer reporter
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

  const bundler = new Parcel(options);

  const { bundleGraph } = await bundler.run();

  const assets = [];
  bundleGraph.getBundles().forEach(bundle => {
    assets.push(path.relative(process.cwd(), bundle.filePath));
  });

  return {
    time: Date.now() - startTime,
    assets
  };
}
