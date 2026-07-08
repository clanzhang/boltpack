import { Parcel } from '@parcel/core';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { logger } from './utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function timestamp() {
  return new Date().toTimeString().slice(0, 8);
}

export async function dev({ entry, port, outDir, noCache = false }) {
  const entryFilePath = path.resolve(process.cwd(), entry);
  const outDirPath = path.resolve(process.cwd(), outDir);
  const configPath = path.resolve(__dirname, '..', 'node_modules', '@parcel', 'config-default');

  const bundler = new Parcel({
    entries: entryFilePath,
    config: configPath,
    mode: 'development',
    outDir: outDirPath,
    shouldDisableCache: noCache,
    serveOptions: {
      port,
      host: 'localhost',
    },
    hmrOptions: {
      port,
    },
    targets: {
      browser: {
        distDir: outDirPath,
      },
    },
    defaultTargetOptions: {
      engines: {
        browsers: ['> 0.5%', 'last 2 versions', 'not dead'],
      },
    },
  });

  logger.info(`Starting dev server...`);
  logger.info(`Entry: ${entry}`);
  logger.info(`Output directory: ${outDir}`);
  logger.info(`Port: ${port}`);

  let firstBuild = true;

  await bundler.watch((err, event) => {
    if (err) {
      logger.error(`Fatal error: ${err.message}`);
      return;
    }

    if (event.type === 'buildSuccess') {
      if (firstBuild) {
        firstBuild = false;
        const bundleCount = event.bundleGraph.getBundles().length;
        console.log(
          chalk.green.bold(`\n🚀 Server running at `) +
          chalk.cyan.underline(`http://localhost:${port}`)
        );
        logger.success(`Initial build completed in ${event.buildTime}ms (${bundleCount} bundles)`);
        console.log(chalk.gray('   Watching for changes...\n'));
      } else {
        console.log(
          chalk.cyan(`🔄 [${timestamp()}] `) +
          chalk.green(`Rebuilt successfully in ${event.buildTime}ms`)
        );
      }
    } else if (event.type === 'buildFailure') {
      console.log(chalk.red(`❌ [${timestamp()}] Build failed:`));
      event.diagnostics.forEach(diagnostic => {
        logger.error(`  - ${diagnostic.message}`);
        if (diagnostic.codeFrame) {
          console.log(chalk.red(`\n${diagnostic.codeFrame}`));
        }
      });
      console.log(chalk.gray('   Fix the error and save to retry...\n'));
    }
  });
}
