#!/usr/bin/env node

import { Command } from 'commander';
import { build } from '../src/build.js';
import { dev } from '../src/dev.js';
import { logger } from '../src/utils/logger.js';

const program = new Command();

program
  .name('boltpack')
  .description('A fast frontend build & dev CLI tool based on Parcel Node API and Lightning CSS')
  .version('0.0.1');

// ── Default command: boltpack <entry>  (build) ──────────────────────
program
  .argument('[entry]', 'Entry file to build (e.g., src/index.html)')
  .option('-m, --mode <mode>', 'Build mode: development or production', 'production')
  .option('-o, --out-dir <dir>', 'Output directory', 'dist')
  .action(async (entry, options) => {
    if (!entry) {
      program.help();
      return;
    }

    const { mode, outDir } = options;

    if (!['development', 'production'].includes(mode)) {
      logger.error(`Invalid mode: ${mode}. Must be either 'development' or 'production'`);
      process.exit(1);
    }

    logger.info(`Starting build in ${mode} mode`);
    logger.info(`Entry: ${entry}`);
    logger.info(`Output directory: ${outDir}`);

    try {
      const result = await build({ entry, mode, outDir });
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

// ── Subcommand: boltpack dev <entry>  (dev server + HMR) ────────────
program
  .command('dev <entry>')
  .description('Start a dev server with HMR')
  .option('-p, --port <port>', 'Dev server port', '3000')
  .option('-o, --out-dir <dir>', 'Output directory', 'dist')
  .action(async (entry, options) => {
    const port = parseInt(options.port, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      logger.error(`Invalid port: ${options.port}. Must be a number between 1 and 65535`);
      process.exit(1);
    }

    try {
      await dev({ entry, port, outDir: options.outDir });
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

program.parse();
