#!/usr/bin/env node

import { Command } from 'commander';
import { build } from '../src/build.js';
import { logger } from '../src/utils/logger.js';

const program = new Command();

program
  .name('my-build')
  .description('A fast frontend build CLI tool based on Parcel Node API')
  .argument('<entry>', 'Entry file to build (e.g., src/index.html)')
  .option('-m, --mode <mode>', 'Build mode: development or production', 'production')
  .option('-o, --out-dir <dir>', 'Output directory', 'dist')
  .action(async (entry, options) => {
    const { mode, outDir } = options;

    if (!['development', 'production'].includes(mode)) {
      logger.error(`Invalid mode: ${mode}. Must be either 'development' or 'production'`);
      process.exit(1);
    }

    logger.info(`Starting build in ${mode} mode`);
    logger.info(`Entry: ${entry}`);
    logger.info(`Output directory: ${outDir}`);

    try {
      const result = await build({
        entry,
        mode,
        outDir
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

program.parse();
