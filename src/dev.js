import { Parcel } from '@parcel/core';
import path from 'path';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { createProxyMiddleware } from 'http-proxy-middleware';
import pc from 'picocolors';
import { logger } from './utils/logger.js';
import { getCustomConfigPath } from './config-loader.js';
import { startTypeWatch } from './typecheck.js';
import { ensureAtomicCssPostCss, detectAtomicCss } from './atomic-css.js';

const require = createRequire(import.meta.url);
const { setAliasConfig } = require('./parcel-config/resolver-alias.cjs');

process.env.NODE_ENV = 'development';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findFreePort(startPort) {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.unref();
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') resolve(findFreePort(startPort + 1));
      else reject(err);
    });
    server.listen(startPort, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

export async function dev({ entry, port, outDir, noCache = false, proxy = {}, alias = {}, publicDir = 'public' }) {
  const projectRoot = process.cwd();
  const entryFilePath = path.resolve(projectRoot, entry);
  const outDirPath = path.resolve(projectRoot, outDir);

  const hasProxy = proxy && Object.keys(proxy).length > 0;
  const hasAlias = alias && Object.keys(alias).length > 0;

  if (hasAlias) setAliasConfig(alias, projectRoot);

  // ── Atomic CSS auto-wire (Tailwind / UnoCSS) ──
  ensureAtomicCssPostCss(projectRoot);

  const configPath = getCustomConfigPath(alias);

  let parcelPort = port;
  let proxyMiddlewares = [];

  if (hasProxy) {
    parcelPort = await findFreePort(port + 1);
    for (const [pathPrefix, target] of Object.entries(proxy)) {
      const targetStr = typeof target === 'string' ? target : target.target;
      const changeOrigin = typeof target === 'object' ? target.changeOrigin ?? true : true;
      proxyMiddlewares.push({
        path: pathPrefix,
        middleware: createProxyMiddleware({ target: targetStr, changeOrigin, ws: true }),
      });
    }
  }

  const bundler = new Parcel({
    entries: entryFilePath,
    config: configPath,
    mode: 'development',
    outDir: outDirPath,
    shouldDisableCache: noCache,
    env: { NODE_ENV: 'development' },
    serveOptions: { port: parcelPort, host: 'localhost' },
    hmrOptions: { port: parcelPort },
    targets: { browser: { distDir: outDirPath } },
    defaultTargetOptions: {
      engines: { browsers: ['> 0.5%', 'last 2 versions', 'not dead'] },
    },
  });

  logger.intro(`${pc.bold('boltpack')} ${pc.dim('dev')}`);
  logger.kv('entry', entry);
  logger.kv('outDir', outDir);
  logger.kv('port', String(port));
  if (noCache) logger.kv('cache', 'off');
  if (hasAlias) logger.kv('alias', Object.entries(alias).map(([k, v]) => `${k}→${v}`).join(' '));
  if (hasProxy) {
    logger.kv('proxy', '');
    for (const [prefix, target] of Object.entries(proxy)) {
      const t = typeof target === 'string' ? target : target.target;
      logger.detail(`${prefix} → ${t}`);
    }
  }
  const css = detectAtomicCss(projectRoot);
  if (css) logger.kv('css', css.engine);

  let firstBuild = true;

  if (hasProxy) {
    const server = http.createServer((req, res) => {
      for (const { path: prefix, middleware } of proxyMiddlewares) {
        if (req.url.startsWith(prefix)) { middleware(req, res, () => {}); return; }
      }
      const proxyReq = http.request({
        hostname: 'localhost', port: parcelPort, path: req.url,
        method: req.method, headers: req.headers,
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      });
      proxyReq.on('error', () => {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Bad Gateway: dev server not ready yet');
      });
      req.pipe(proxyReq);
    });

    server.on('upgrade', (req, socket, head) => {
      for (const { path: prefix, middleware } of proxyMiddlewares) {
        if (req.url.startsWith(prefix)) {
          if (middleware.upgrade) middleware.upgrade(req, socket, head);
          return;
        }
      }
      const proxyReq = http.request({
        hostname: 'localhost', port: parcelPort, path: req.url,
        method: 'GET', headers: req.headers,
      });
      proxyReq.on('upgrade', (proxyRes, proxySocket) => {
        socket.write('HTTP/1.1 101 Switching Protocols\r\n');
        for (const [k, v] of Object.entries(proxyRes.headers)) socket.write(`${k}: ${v}\r\n`);
        socket.write('\r\n');
        proxySocket.pipe(socket);
        socket.pipe(proxySocket);
      });
      proxyReq.on('error', () => socket.destroy());
      proxyReq.end();
    });

    server.listen(port, '0.0.0.0');
  }

  // ── Parallel TypeScript typecheck (non-blocking) ──
  const typeWatcher = startTypeWatch(projectRoot);

  await bundler.watch((err, event) => {
    if (err) { logger.error(`Fatal: ${err.message}`); return; }

    if (event.type === 'buildSuccess') {
      if (firstBuild) {
        firstBuild = false;
        const bundles = event.bundleGraph.getBundles().length;
        logger.blank();
        logger.success(`Ready in ${event.buildTime}ms · ${bundles} bundles`);
        logger.raw(`  ${pc.underline(pc.cyan(`http://localhost:${port}`))}`);
        logger.blank();
        logger.raw(`  ${pc.dim('watching for changes…')}`);
        logger.blank();
      } else {
        logger.timestamp(pc.green(`rebuilt in ${event.buildTime}ms`), 'success');
      }
    } else if (event.type === 'buildFailure') {
      logger.blank();
      logger.timestamp(pc.red('build failed'), 'error');
      event.diagnostics.forEach(d => logger.diagnostic(d.message, d.codeFrame));
      logger.raw(`  ${pc.dim('fix the error and save to retry…')}`);
      logger.blank();
    }
  });

  // ── Ensure parallel typecheck never blocks exit ──
  const cleanup = () => {
    if (typeWatcher) typeWatcher.stop();
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}
