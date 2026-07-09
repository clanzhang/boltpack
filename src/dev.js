import { Parcel } from '@parcel/core';
import path from 'path';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
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

function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

async function findFreePort(startPort, maxRetries = 100) {
  for (let i = 0; i < maxRetries; i++) {
    const port = startPort + i;
    if (await checkPort(port)) return port;
  }
  throw new Error(`No available port found between ${startPort} and ${startPort + maxRetries}`);
}

function printDiagnostics(error) {
  if (error.diagnostics) {
    error.diagnostics.forEach(d => logger.diagnostic(d.message, d.codeFrame));
  } else {
    logger.error(error.message);
  }
}

export async function dev({ entry, port, outDir, noCache = false, proxy = {}, alias = {}, publicDir = 'public' }) {
  const projectRoot = process.cwd();
  const entryFilePath = path.resolve(projectRoot, entry);
  const outDirPath = path.resolve(projectRoot, outDir);

  const hasAlias = alias && Object.keys(alias).length > 0;
  const hasProxy = proxy && Object.keys(proxy).length > 0;

  if (hasAlias) setAliasConfig(alias, projectRoot);
  ensureAtomicCssPostCss(projectRoot);

  let currentPort = port;
  let bundler = null;
  let proxyServer = null;
  let typeWatcher = null;
  let firstBuild = true;

  const configPath = getCustomConfigPath(alias);

  async function startServer() {
    firstBuild = true;

    const originalPort = currentPort;
    currentPort = await findFreePort(currentPort);
    if (currentPort !== originalPort) {
      logger.warn(pc.yellow(`⚠️  Port ${originalPort} is in use, switching to ${currentPort}`));
    }

    let parcelPort = currentPort;
    const proxyMiddlewares = [];

    if (hasProxy) {
      parcelPort = await findFreePort(currentPort + 1);
      for (const [pathPrefix, target] of Object.entries(proxy)) {
        const targetStr = typeof target === 'string' ? target : target.target;
        const changeOrigin = typeof target === 'object' ? target.changeOrigin ?? true : true;
        proxyMiddlewares.push({
          path: pathPrefix,
          middleware: createProxyMiddleware({ target: targetStr, changeOrigin, ws: true }),
        });
      }
    }

    bundler = new Parcel({
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
    logger.kv('port', String(currentPort));
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

    if (hasProxy) {
      proxyServer = http.createServer((req, res) => {
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

      proxyServer.on('upgrade', (req, socket, head) => {
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

      proxyServer.listen(currentPort, '0.0.0.0');
    }

    typeWatcher = startTypeWatch(projectRoot);

    await bundler.watch((err, event) => {
      if (err) {
        logger.error(`Fatal: ${err.message}`);
        return;
      }

      if (event.type === 'buildSuccess') {
        if (firstBuild) {
          firstBuild = false;
          const bundles = event.bundleGraph.getBundles().length;
          logger.blank();
          logger.success(`Ready in ${event.buildTime}ms · ${bundles} bundles`);
          logger.raw(`  ${pc.underline(pc.cyan(`http://localhost:${currentPort}`))}`);
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
  }

  function cleanup() {
    if (typeWatcher) { typeWatcher.stop(); typeWatcher = null; }
    if (proxyServer) { proxyServer.close(); proxyServer = null; }
    bundler = null;
  }

  function onExit() {
    cleanup();
    process.exit(0);
  }

  process.on('SIGINT', onExit);
  process.on('SIGTERM', onExit);

  async function handleStart() {
    try {
      await startServer();
    } catch (error) {
      cleanup();
      logger.blank();
      logger.error(pc.red('Failed to start dev server:'));
      printDiagnostics(error);
      logger.blank();
      logger.raw(pc.yellow(`💡 Fix the error above, then press ${pc.bold('[r]')} to restart or ${pc.bold('[q]')} to quit.`));
      logger.blank();
    }
  }

  process.stdin.setEncoding('utf8');
  process.stdin.setRawMode(true);
  process.stdin.resume();

  process.stdin.on('data', async (key) => {
    if (key === '\u0003' || key === 'q' || key === 'Q') {
      onExit();
    } else if (key === 'r' || key === 'R') {
      cleanup();
      logger.blank();
      logger.info(pc.blue('Restarting dev server...'));
      logger.blank();
      await handleStart();
    }
  });

  await handleStart();
}
