import fs from 'fs-extra';
import path from 'path';
import pc from 'picocolors';
import { logger } from './utils/logger.js';

export async function renderSSR({ serverEntryPath, clientDir, routes }) {
  const htmlFiles = [];
  const shell = await readHtmlShell(clientDir);

  if (!shell) {
    logger.error('Cannot prerender: no client index.html found');
    return [];
  }

  let render;
  try {
    const mod = await import(`file://${serverEntryPath}`);
    render = mod.render || mod.default?.render;
    if (typeof render !== 'function') {
      logger.warn('server entry has no `render` export — skipping prerender');
      return [];
    }
  } catch (err) {
    logger.error(`Failed to load server bundle: ${err.message}`);
    return [];
  }

  for (const route of routes) {
    try {
      const content = await render({ url: route });
      const html = injectContent(shell, content);
      const outPath = routeToPath(clientDir, route);
      await fs.mkdirp(path.dirname(outPath));
      await fs.writeFile(outPath, html, 'utf8');
      htmlFiles.push(outPath);
    } catch (err) {
      logger.error(pc.red(`✗ Render failed for ${route}: ${err.message}`));
    }
  }

  return htmlFiles;
}

async function readHtmlShell(clientDir) {
  const indexPath = path.join(clientDir, 'index.html');
  if (await fs.pathExists(indexPath)) {
    return fs.readFile(indexPath, 'utf8');
  }
  return '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div id="app"></div></body></html>';
}

function injectContent(shell, content) {
  if (shell.includes('<div id="app"></div>')) {
    return shell.replace('<div id="app"></div>', `<div id="app">${content}</div>`);
  }
  if (shell.includes('<!--app-->')) {
    return shell.replace('<!--app-->', content);
  }
  if (shell.includes('<div id="root"></div>')) {
    return shell.replace('<div id="root"></div>', `<div id="root">${content}</div>`);
  }
  return shell.replace('</body>', `${content}</body>`);
}

function routeToPath(clientDir, route) {
  if (route === '/' || route === '') {
    return path.join(clientDir, 'index.html');
  }
  const clean = route.replace(/^\//, '').replace(/\/$/, '');
  return path.join(clientDir, clean, 'index.html');
}
