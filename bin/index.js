#!/usr/bin/env node

import { Command } from 'commander';
import { build } from '../src/build.js';
import { dev } from '../src/dev.js';
import { clean } from '../src/clean.js';
import { loadConfig } from '../src/config.js';
import { logger } from '../src/utils/logger.js';

const program = new Command();

program
  .name('boltpack')
  .description('A fast frontend build & dev CLI tool based on Parcel Node API and Lightning CSS')
  .version('0.0.1');

async function getMergedConfig(cliOptions, entry = null) {
  const fileConfig = await loadConfig();
  const noCache = cliOptions.cache === false ? true : (fileConfig.noCache ?? false);

  return {
    ...fileConfig,
    ...(entry ? { entry } : {}),
    ...(cliOptions.mode !== undefined ? { mode: cliOptions.mode } : {}),
    ...(cliOptions.outDir !== undefined ? { outDir: cliOptions.outDir } : {}),
    ...(cliOptions.port !== undefined ? { port: parseInt(cliOptions.port, 10) } : {}),
    ...(cliOptions.analyze !== undefined ? { analyze: cliOptions.analyze } : {}),
    noCache,
  };
}

program
  .argument('[entry]', 'Entry file to build (e.g., src/index.html)')
  .option('-m, --mode <mode>', 'Build mode: development or production', 'production')
  .option('-o, --out-dir <dir>', 'Output directory', 'dist')
  .option('--no-cache', 'Disable build cache')
  .option('-a, --analyze', 'Enable bundle size analysis (production mode only)')
  .action(async (entry, options) => {
    if (!entry) {
      program.help();
      return;
    }

    const config = await getMergedConfig(options, entry);

    if (!['development', 'production'].includes(config.mode)) {
      logger.error(`Invalid mode: ${config.mode}. Must be either 'development' or 'production'`);
      process.exit(1);
    }

    logger.info(`Starting build in ${config.mode} mode`);
    logger.info(`Entry: ${config.entry}`);
    logger.info(`Output directory: ${config.outDir}`);
    if (config.noCache) {
      logger.info(`Cache: disabled`);
    }

    try {
      const result = await build({
        entry: config.entry,
        mode: config.mode,
        outDir: config.outDir,
        noCache: config.noCache,
        analyze: config.analyze,
        publicDir: config.publicDir,
        alias: config.alias,
      });
      logger.success(`Build completed in ${result.time}ms`);
      logger.info(`Generated ${result.assets.length} asset(s):`);
      result.assets.forEach(asset => {
        logger.info(`  - ${asset}`);
      });
    } catch (error) {
      logger.error('Build failed:');
      if (error.diagnostics) {
        error.diagnostics.forEach(diagnostic => {
          logger.error(`  - ${diagnostic.message}`);
          if (diagnostic.codeFrame) {
            logger.error(`\n${diagnostic.codeFrame}`);
          }
        });
      } else {
        logger.error(`  - ${error.message}`);
      }
      process.exit(1);
    }
  });

program
  .command('dev <entry>')
  .description('Start a dev server with HMR')
  .option('-p, --port <port>', 'Dev server port')
  .option('-o, --out-dir <dir>', 'Output directory', 'dist')
  .option('--no-cache', 'Disable build cache')
  .action(async (entry, options) => {
    const config = await getMergedConfig(options, entry);
    const port = config.port;

    if (isNaN(port) || port < 1 || port > 65535) {
      logger.error(`Invalid port: ${port}. Must be a number between 1 and 65535`);
      process.exit(1);
    }

    if (config.noCache) {
      logger.info(`Cache: disabled`);
    }

    try {
      await dev({
        entry: config.entry,
        port,
        outDir: config.outDir,
        noCache: config.noCache,
        proxy: config.proxy,
        alias: config.alias,
        publicDir: config.publicDir,
      });
    } catch (error) {
      logger.error('Dev server failed to start:');
      if (error.diagnostics) {
        error.diagnostics.forEach(diagnostic => {
          logger.error(`  - ${diagnostic.message}`);
          if (diagnostic.codeFrame) {
            logger.error(`\n${diagnostic.codeFrame}`);
          }
        });
      } else {
        logger.error(`  - ${error.message}`);
      }
      process.exit(1);
    }
  });

program
  .command('clean')
  .description('Clean build artifacts and parcel cache')
  .option('-o, --out-dir <dir>', 'Output directory to clean', 'dist')
  .action((options) => {
    clean({ outDir: options.outDir });
  });

program.parse();
