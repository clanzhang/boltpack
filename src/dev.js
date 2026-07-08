import { Parcel } from '@parcel/core';
import path from 'path';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { createProxyMiddleware } from 'http-proxy-middleware';
import chalk from 'chalk';
import { logger } from './utils/logger.js';
import { getCustomConfigPath } from './config-loader.js';

const require = createRequire(import.meta.url);
const { setAliasConfig } = require('./parcel-config/resolver-alias.cjs');

process.env.NODE_ENV = 'development';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function timestamp() {
  return new Date().toTimeString().slice(0, 8);
}

function findFreePort(startPort) {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.unref();
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(findFreePort(startPort + 1));
      } else {
        reject(err);
      }
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

  if (hasAlias) {
    setAliasConfig(alias, projectRoot);
  }

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
        middleware: createProxyMiddleware({
          target: targetStr,
          changeOrigin,
          ws: true,
        }),
      });
    }
  }

  const bundler = new Parcel({
    entries: entryFilePath,
    config: configPath,
    mode: 'development',
    outDir: outDirPath,
    shouldDisableCache: noCache,
    env: {
      NODE_ENV: 'development',
    },
    serveOptions: {
      port: parcelPort,
      host: 'localhost',
    },
    hmrOptions: {
      port: parcelPort,
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
  if (noCache) {
    logger.info(`Cache: disabled`);
  }
  if (hasAlias) {
    logger.info(`🔗 Alias: ${Object.entries(alias).map(([k, v]) => `${k} → ${v}`).join(', ')}`);
  }
  if (hasProxy) {
    logger.info(`🔀 Proxy:`);
    for (const [pathPrefix, target] of Object.entries(proxy)) {
      const targetStr = typeof target === 'string' ? target : target.target;
      logger.info(`   ${pathPrefix} → ${targetStr}`);
    }
  }

  let firstBuild = true;

  if (hasProxy) {
    const server = http.createServer((req, res) => {
      let handled = false;
      for (const { path: pathPrefix, middleware } of proxyMiddlewares) {
        if (req.url.startsWith(pathPrefix)) {
          middleware(req, res, () => {});
          handled = true;
          break;
        }
      }
      if (!handled) {
        const options = {
          hostname: 'localhost',
          port: parcelPort,
          path: req.url,
          method: req.method,
          headers: req.headers,
        };
        const proxyReq = http.request(options, (proxyRes) => {
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          proxyRes.pipe(res);
        });
        proxyReq.on('error', () => {
          res.writeHead(502, { 'Content-Type': 'text/plain' });
          res.end('Bad Gateway: dev server not ready yet');
        });
        req.pipe(proxyReq);
      }
    });

    server.on('upgrade', (req, socket, head) => {
      for (const { path: pathPrefix, middleware } of proxyMiddlewares) {
        if (req.url.startsWith(pathPrefix)) {
          if (middleware.upgrade) {
            middleware.upgrade(req, socket, head);
          }
          return;
        }
      }
      const options = {
        hostname: 'localhost',
        port: parcelPort,
        path: req.url,
        method: req.method,
        headers: req.headers,
      };
      const proxyReq = http.request({ ...options, method: 'GET' });
      proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
        socket.write('HTTP/1.1 101 Switching Protocols\r\n');
        for (const [key, val] of Object.entries(proxyRes.headers)) {
          socket.write(`${key}: ${val}\r\n`);
        }
        socket.write('\r\n');
        proxySocket.pipe(socket);
        socket.pipe(proxySocket);
      });
      proxyReq.on('error', () => socket.destroy());
      proxyReq.end();
    });

    server.listen(port, '0.0.0.0');
  }

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
