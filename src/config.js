import path from 'node:path';
import fs from 'node:fs';

const CONFIG_FILE = 'boltpack.config.js';

export const DEFAULT_CONFIG = {
  port: 3000,
  publicDir: 'public',
  proxy: {},
  alias: {},
};

export async function loadConfig(cwd = process.cwd()) {
  const configPath = path.resolve(cwd, CONFIG_FILE);

  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const fileUrl = `file://${configPath}`;
    const mod = await import(fileUrl);
    const userConfig = mod.default || mod;

    return {
      ...DEFAULT_CONFIG,
      ...userConfig,
    };
  } catch (err) {
    throw new Error(`Failed to load ${CONFIG_FILE}: ${err.message}`);
  }
}

export function mergeConfig(cliOptions, fileConfig) {
  const merged = { ...fileConfig };

  if (cliOptions.port !== undefined) {
    merged.port = cliOptions.port;
  }
  if (cliOptions.outDir !== undefined) {
    merged.outDir = cliOptions.outDir;
  }
  if (cliOptions.publicDir !== undefined) {
    merged.publicDir = cliOptions.publicDir;
  }
  if (cliOptions.noCache !== undefined) {
    merged.noCache = cliOptions.noCache;
  }
  if (cliOptions.analyze !== undefined) {
    merged.analyze = cliOptions.analyze;
  }
  if (cliOptions.mode !== undefined) {
    merged.mode = cliOptions.mode;
  }
  if (cliOptions.entry !== undefined) {
    merged.entry = cliOptions.entry;
  }

  return merged;
}
