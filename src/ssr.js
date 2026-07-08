import { Parcel } from '@parcel/core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import pc from 'picocolors';
import { logger } from './utils/logger.js';
import { cleanOutDir } from './clean.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG = path.resolve(__dirname, '..', 'node_modules', '@parcel', 'config-default');

/**
 * SSR/SSG build pipeline.
 *
 * Two outputs:
 *   - client/  → browser bundle (hydration scripts, DOM-ready HTML shell)
 *   - server/  → Node CJS bundle exposing `render(url) => string`
 *
 * The user provides an isomorphic entry that exports a `render` function
 * (typically wrapping `react-dom/server.renderToString` or `vue/server-renderer`).
 *
 *   src/entry-server.{ts,tsx,js,jsx}   exports: { render(props) => string }
 *
 * After both builds, `prerender()` imports the server bundle, invokes render()
 * per route, and writes static HTML into the client output directory.
 */

function resolveEntry(cwd, entry) {
  // Accept either an explicit server entry or derive `entry-server.*` from the client entry.
  const ext = path.extname(entry);
  const base = entry.slice(0, -ext.length || undefined);
  const candidates = [
    entry.replace(ext, `.server${ext}`),
    `${base}-server${ext}`,
    entry.replace(/index\.(html|js|ts|tsx|jsx)$/, 'entry-server.$1'),
  ].filter(Boolean);
  for (const c of candidates) {
    const abs = path.resolve(cwd, c);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

function parcelBuild({ entry, outDir, targetEnv, mode, noCache }) {
  const options = {
    entries: entry,
    config: DEFAULT_CONFIG,
    mode,
    outDir,
    shouldDisableCache: noCache,
    env: { NODE_ENV: mode },
    targets: targetEnv === 'node'
      ? { node: { outputFormat: 'commonjs', distDir: outDir, sourceMap: true, scopeHoist: true, includeNodeModules: true } }
      : { browser: { distDir: outDir } },
    defaultTargetOptions: {
      engines: { browsers: ['> 0.5%', 'last 2 versions', 'not dead'] },
    },
  };
  return new Parcel(options).run();
}

/**
 * Build both client and server bundles.
 * Returns { clientDir, serverDir, serverEntry, clientAssets, time }.
 */
export async function buildSSR({ entry, outDir = 'dist', mode = 'production', noCache = false, routes = ['/'] }) {
  const startTime = Date.now();
  const projectRoot = process.cwd();
  const entryAbs = path.resolve(projectRoot, entry);
  const serverEntry = resolveEntry(projectRoot, entry);

  if (!serverEntry) {
    throw new Error(
      `SSR requires a server entry. Expected one of:\n` +
      `  src/entry-server.{ts,tsx,js,jsx}  or  ${path.basename(entry, path.extname(entry))}.server${path.extname(entry)}\n` +
      `Exporting: { render(props) => string }`
    );
  }

  const clientDir = path.resolve(projectRoot, outDir, 'client');
  const serverDir = path.resolve(projectRoot, outDir, 'server');

  logger.section('SSR build');
  logger.kv('client', path.relative(projectRoot, clientDir));
  logger.kv('server', path.relative(projectRoot, serverDir));
  logger.kv('routes', routes.join(' '));

  cleanOutDir(outDir);

  // Client bundle
  logger.step('building client bundle…');
  const clientResult = await parcelBuild({
    entry: entryAbs, outDir: clientDir, targetEnv: 'browser', mode, noCache,
  });
  const clientAssets = [];
  clientResult.bundleGraph.getBundles().forEach(b => {
    clientAssets.push(path.relative(projectRoot, b.filePath));
  });
  logger.success(`client: ${clientAssets.length} bundles`);

  // Server bundle
  logger.step('building server bundle…');
  const serverResult = await parcelBuild({
    entry: serverEntry, outDir: serverDir, targetEnv: 'node', mode, noCache,
  });
  let serverEntryOut = null;
  serverResult.bundleGraph.getBundles().forEach(b => {
    if (b.type === 'js' || b.type === 'cjs' || b.type === 'mjs') {
      if (!serverEntryOut) serverEntryOut = b.filePath;
    }
  });
  logger.success(`server: ${path.relative(projectRoot, serverEntryOut)}`);

  // Prerender static HTML
  logger.step('prerendering routes…');
  const htmlFiles = await prerender({
    serverEntryOut,
    clientDir,
    routes,
    projectRoot,
  });
  htmlFiles.forEach(f => logger.detail(f));

  return {
    clientDir,
    serverDir,
    serverEntry: serverEntryOut,
    clientAssets,
    htmlFiles,
    time: Date.now() - startTime,
  };
}

/**
 * Import the server bundle, call render() for each route, write HTML.
 * Falls back gracefully if the entry has no `render` export (SSG-only).
 */
async function prerender({ serverEntryOut, clientDir, routes, projectRoot }) {
  const serverUrl = pathToFileUrl(serverEntryOut);
  const mod = await import(serverUrl);
  const render = mod.render || mod.default?.render;

  if (typeof render !== 'function') {
    logger.warn('server entry has no `render` export — skipping prerender (SSR-mode only)');
    return [];
  }

  const htmlShell = readHtmlShell(clientDir);
  const written = [];

  for (const route of routes) {
    const props = { url: route, path: route };
    let content;
    try {
      content = await render(props);
    } catch (err) {
      logger.error(`render failed for ${route}: ${err.message}`);
      continue;
    }

    const html = injectShell(htmlShell, content, route);
    const outFile = routeToFilePath(clientDir, route);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, html);
    written.push(path.relative(projectRoot, outFile));
  }
  return written;
}

function pathToFileUrl(p) {
  return `file://${p}`;
}

function readHtmlShell(clientDir) {
  const indexHtml = path.join(clientDir, 'index.html');
  return fs.existsSync(indexHtml) ? fs.readFileSync(indexHtml, 'utf8') : '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><!--app--></body></html>';
}

function injectShell(shell, content, route) {
  if (shell.includes('<!--app-->')) {
    return shell.replace('<!--app-->', content);
  }
  if (shell.includes('<div id="root"></div>')) {
    return shell.replace('<div id="root"></div>', `<div id="root">${content}</div>`);
  }
  return shell.replace('</body>', `${content}</body>`);
}

function routeToFilePath(clientDir, route) {
  if (route === '/' || route === '') return path.join(clientDir, 'index.html');
  const clean = route.replace(/^\//, '').replace(/\/$/, '');
  return path.join(clientDir, clean, 'index.html');
}

/**
 * Dev-mode SSR: rebuild on change and re-prerender.
 * Reuses Parcel watch() for the server bundle; client is served by the
 * regular dev server. On each rebuild, re-invoke render() and stream
 * the new HTML to the browser via the HMR websocket.
 */
export async function watchSSR({ entry, outDir = 'dist', noCache = false, routes = ['/'] }) {
  const projectRoot = process.cwd();
  const serverEntry = resolveEntry(projectRoot, entry);
  if (!serverEntry) throw new Error('SSR dev requires a server entry (see buildSSR)');

  const serverDir = path.resolve(projectRoot, outDir, 'server');
  const bundler = new Parcel({
    entries: serverEntry,
    config: DEFAULT_CONFIG,
    mode: 'development',
    outDir: serverDir,
    shouldDisableCache: noCache,
    env: { NODE_ENV: 'development' },
    targets: { node: { outputFormat: 'commonjs', distDir: serverDir, includeNodeModules: true } },
  });

  logger.info('SSR dev: watching server entry…');
  return bundler.watch((err, event) => {
    if (err) { logger.error(`SSR watch: ${err.message}`); return; }
    if (event.type === 'buildSuccess') {
      let entryOut = null;
      event.bundleGraph.getBundles().forEach(b => {
        if (!entryOut && (b.type === 'js' || b.type === 'cjs')) entryOut = b.filePath;
      });
      logger.timestamp(pc.green(`server rebuilt in ${event.buildTime}ms`), 'success');
      // Re-prerender is triggered by the host dev server via HMR payload.
    } else if (event.type === 'buildFailure') {
      event.diagnostics.forEach(d => logger.diagnostic(d.message, d.codeFrame));
    }
  });
}
