import fs from 'node:fs';
import path from 'node:path';
import { logger } from './utils/logger.js';

/**
 * Plugin contract:
 *   {
 *     name: string,
 *     setup?(ctx): Promise<void>,          // parallel init
 *     beforeBuild?(ctx): Promise<void>,    // serial, ordered
 *     transform?(asset): Promise<asset>,   // serial pipeline, asset = { fileName, code, type }
 *     afterBuild?(ctx): Promise<void>,     // parallel post-processing (e.g. emit PWA manifest)
 *   }
 *
 * Lifecycle order:
 *   setup (parallel) → beforeBuild (serial) → Parcel build
 *   → transform (serial, per-asset) → afterBuild (parallel)
 */

export class PluginContext {
  constructor({ cwd, mode, outDir, env = {} }) {
    this.cwd = cwd;
    this.mode = mode;
    this.outDir = outDir;
    this.env = env;
    this.assets = [];          // emitted asset descriptors
    this.emittedFiles = [];    // files written by plugins (manifest.json, sw.js, ...)
    this.errors = [];
  }

  /** Read an emitted asset's source as string. */
  readAsset(fileName) {
    const abs = path.resolve(this.outDir, fileName);
    return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
  }

  /** Write a synthetic file into the output directory (e.g. manifest.webmanifest). */
  emitFile(fileName, content) {
    const abs = path.resolve(this.outDir, fileName);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    this.emittedFiles.push(fileName);
    return abs;
  }
}

export class PluginManager {
  constructor(plugins = []) {
    this.plugins = plugins.filter(Boolean);
  }

  get names() {
    return this.plugins.map(p => p.name).join(', ');
  }

  /** Parallel: init all plugins. Failures are collected, never abort. */
  async setup(ctx) {
    await Promise.all(
      this.plugins.map(async (p) => {
        try {
          if (typeof p.setup === 'function') await p.setup(ctx);
        } catch (err) {
          ctx.errors.push({ plugin: p.name, hook: 'setup', err });
          logger.warn(`plugin "${p.name}" setup failed: ${err.message}`);
        }
      })
    );
  }

  /** Serial: ordered pre-build side effects. */
  async beforeBuild(ctx) {
    for (const p of this.plugins) {
      if (typeof p.beforeBuild !== 'function') continue;
      try {
        await p.beforeBuild(ctx);
      } catch (err) {
        ctx.errors.push({ plugin: p.name, hook: 'beforeBuild', err });
        logger.warn(`plugin "${p.name}" beforeBuild failed: ${err.message}`);
      }
    }
  }

  /**
   * Serial transform pipeline: each plugin receives the asset mutated by the previous one.
   * Plugins may mutate code in place (AST transforms, minification, banner injection).
   * Writing the asset back to disk happens once after the pipeline completes.
   */
  async transformAssets(assets) {
    let current = assets;
    for (const p of this.plugins) {
      if (typeof p.transform !== 'function') continue;
      const next = [];
      for (const asset of current) {
        try {
          const result = await p.transform(asset);
          next.push(result || asset);
        } catch (err) {
          logger.warn(`plugin "${p.name}" transform failed on ${asset.fileName}: ${err.message}`);
          next.push(asset);
        }
      }
      current = next;
    }
    return current;
  }

  /** Parallel: independent post-build work (PWA manifest, sitemap, size report). */
  async afterBuild(ctx) {
    await Promise.all(
      this.plugins.map(async (p) => {
        if (typeof p.afterBuild !== 'function') return;
        try {
          await p.afterBuild(ctx);
        } catch (err) {
          ctx.errors.push({ plugin: p.name, hook: 'afterBuild', err });
          logger.warn(`plugin "${p.name}" afterBuild failed: ${err.message}`);
        }
      })
    );
  }
}

/** Resolve plugin definitions from config: factory functions, objects, or paths. */
export async function resolvePlugins(rawPlugins, cwd) {
  if (!Array.isArray(rawPlugins)) return [];
  const resolved = [];
  for (const entry of rawPlugins) {
    if (typeof entry === 'function') {
      resolved.push(await entry());
    } else if (entry && typeof entry === 'object') {
      resolved.push(entry);
    } else if (typeof entry === 'string') {
      const mod = await import(path.isAbsolute(entry) ? `file://${entry}` : entry);
      resolved.push(mod.default || mod);
    }
  }
  return resolved;
}
