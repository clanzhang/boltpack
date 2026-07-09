#!/usr/bin/env node

import { Command } from 'commander';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { build } from '../src/build.js';
import { dev } from '../src/dev.js';
import { clean } from '../src/clean.js';
import { loadConfig } from '../src/config.js';
import { buildSSR } from '../src/ssr.js';
import { resolvePlugins } from '../src/plugins.js';
import { detectWorkspace, getBuildOrder } from '../src/workspace.js';
import { logger } from '../src/utils/logger.js';

const program = new Command();
const DEFAULT_ENTRY = 'src/index.html';

program
  .name('boltpack')
  .description('A fast frontend build & dev CLI based on Parcel + Lightning CSS')
  .version('0.1.0');

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
    ...(cliOptions.lib !== undefined ? { lib: cliOptions.lib } : {}),
    ...(cliOptions.ssr !== undefined ? { ssr: cliOptions.ssr } : {}),
    ...(cliOptions.routes !== undefined ? { routes: cliOptions.routes.split(',').map(s => s.trim()).filter(Boolean) } : {}),
    noCache,
  };
}

function printBuildResult(result) {
  logger.section('Output');
  logger.assets(result.assets);
  logger.blank();
  logger.success(`Built in ${pc.bold(`${result.time}ms`)}`);
  logger.outro('done.');
}

function printDiagnostics(error) {
  if (error.diagnostics) {
    error.diagnostics.forEach(d => logger.diagnostic(d.message, d.codeFrame));
  } else {
    logger.error(error.message);
  }
}

// ─── Build (default command) ───────────────────────────────────────────────
program
  .argument('[entry]', 'Entry file (e.g., src/index.html) or JS/TS entry with --lib')
  .option('-m, --mode <mode>', 'Build mode: development or production', 'production')
  .option('-o, --out-dir <dir>', 'Output directory', 'dist')
  .option('--no-cache', 'Disable build cache')
  .option('-a, --analyze', 'Bundle size analysis (production only)')
  .option('--lib', 'Library mode — emit ESM + CJS + .d.ts from a JS/TS entry')
  .option('--ssr', 'SSR/SSG — dual client+server build with prerendering')
  .option('--routes <routes>', 'Comma-separated routes to prerender (with --ssr)', '/')
  .action(async (entry, options) => {
    if (!entry) {
      await interactive();
      return;
    }
    await runBuild(entry, options);
  });

// ─── Dev ───────────────────────────────────────────────────────────────────
program
  .command('dev [entry]')
  .description('Start dev server with HMR + parallel typecheck')
  .option('-p, --port <port>', 'Dev server port')
  .option('-o, --out-dir <dir>', 'Output directory', 'dist')
  .option('--no-cache', 'Disable build cache')
  .action(async (entry, options) => {
    const resolvedEntry = entry ?? DEFAULT_ENTRY;
    const config = await getMergedConfig(options, resolvedEntry);
    const port = config.port;
    if (isNaN(port) || port < 1 || port > 65535) {
      logger.error(`Invalid port: ${port}`);
      process.exit(1);
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
      printDiagnostics(error);
      process.exit(1);
    }
  });

// ─── Clean ─────────────────────────────────────────────────────────────────
program
  .command('clean')
  .description('Remove build artifacts and parcel cache')
  .option('-o, --out-dir <dir>', 'Output directory to clean', 'dist')
  .action((options) => {
    clean({ outDir: options.outDir });
  });

// ─── Interactive flow (no args) ────────────────────────────────────────────
async function interactive() {
  logger.intro(`${pc.bold('boltpack')} ${pc.dim('v0.1.0')}`);

  const action = await p.select({
    message: 'What do you want to do?',
    initialValue: 'dev',
    options: [
      { value: 'dev', label: 'Dev', hint: 'HMR server + parallel typecheck' },
      { value: 'build', label: 'Build', hint: 'Production bundle' },
      { value: 'lib', label: 'Build library', hint: 'ESM + CJS + .d.ts' },
      { value: 'clean', label: 'Clean', hint: 'Remove dist & cache' },
    ],
  });

  if (p.isCancel(action)) {
    p.cancel(pc.dim('cancelled'));
    process.exit(0);
  }

  if (action === 'clean') {
    p.outro(pc.dim('cleaning…'));
    clean({});
    return;
  }

  const isLib = action === 'lib';
  const placeholder = isLib ? 'src/index.ts' : 'src/index.html';
  const entry = await p.text({
    message: 'Entry file',
    placeholder,
    defaultValue: placeholder,
    validate: (v) => {
      if (!v || v.trim() === '') return 'Entry is required';
    },
  });

  if (p.isCancel(entry)) {
    p.cancel(pc.dim('cancelled'));
    process.exit(0);
  }

  let mode = 'production';
  if (action === 'dev') {
    const portAns = await p.text({
      message: 'Port',
      placeholder: '3000',
      defaultValue: '3000',
      validate: (v) => (!v || /^\d+$/.test(v)) ? undefined : 'Numbers only',
    });
    if (p.isCancel(portAns)) { p.cancel(pc.dim('cancelled')); process.exit(0); }
    p.outro(pc.dim('starting dev server…'));
    const opts = { port: parseInt(portAns, 10), outDir: 'dist', cache: true };
    const config = await getMergedConfig(opts, entry);
    try {
      await dev({
        entry: config.entry,
        port: config.port,
        outDir: config.outDir,
        noCache: config.noCache,
        proxy: config.proxy,
        alias: config.alias,
        publicDir: config.publicDir,
      });
    } catch (error) {
      printDiagnostics(error);
      process.exit(1);
    }
    return;
  }

  // build / lib
  p.outro(pc.dim('building…'));
  await runBuild(entry, { mode, outDir: 'dist', cache: true, lib: isLib });
}

async function runBuild(entry, options) {
  const config = await getMergedConfig(options, entry);
  if (!['development', 'production'].includes(config.mode)) {
    logger.error(`Invalid mode: ${config.mode}`);
    process.exit(1);
  }

  // ── Resolve plugins from config (factories / objects / paths) ──
  const plugins = await resolvePlugins(config.plugins || [], process.cwd());

  // ── Workspace detection: build shared libs before the app ──
  const workspace = detectWorkspace(process.cwd());
  if (workspace) {
    const order = getBuildOrder(workspace);
    logger.info(`workspace: ${workspace.packages.length} packages · ${workspace.manager}`);
    logger.detail(`build order: ${order.map(pkg => pkg.name).join(' → ')}`);
    // Note: for a single-app build we only build the requested entry.
    // Full workspace builds iterate `order` and invoke build() per package,
    // skipping the one matching `config.entry`.
  }

  const isSSR = config.ssr;
  logger.intro(`${pc.bold(isSSR ? 'ssr build' : config.lib ? 'library build' : 'build')} ${pc.dim(`· ${config.mode}`)}`);
  logger.kv('entry', config.entry);
  logger.kv('outDir', config.outDir);
  if (config.lib) logger.kv('targets', 'esm + cjs + d.ts');
  if (isSSR) logger.kv('ssr', `client + server · routes ${config.routes.join(',')}`);
  if (config.analyze) logger.kv('analyze', 'on');
  if (config.noCache) logger.kv('cache', 'off');

  try {
    if (isSSR) {
      const result = await buildSSR({
        entry: config.entry,
        outDir: config.outDir,
        mode: config.mode,
        noCache: config.noCache,
        routes: config.routes,
      });
      logger.section('Output');
      logger.assets([...result.clientAssets, ...result.htmlFiles]);
      logger.blank();
      logger.success(`SSR built in ${pc.bold(`${result.time}ms`)}`);
      logger.outro('done.');
    } else {
      const result = await build({
        entry: config.entry,
        mode: config.mode,
        outDir: config.outDir,
        noCache: config.noCache,
        analyze: config.analyze,
        publicDir: config.publicDir,
        alias: config.alias,
        lib: config.lib,
        plugins,
      });
      printBuildResult(result);
    }
  } catch (error) {
    logger.blank();
    printDiagnostics(error);
    logger.outro(pc.red('failed.'));
    process.exit(1);
  }
}

program.parse();
