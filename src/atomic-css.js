import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'module';
import { logger } from './utils/logger.js';

const require = createRequire(import.meta.url);

/**
 * Detect atomic CSS engine by probing common config filenames.
 * Returns { engine, configPath } or null.
 */
export function detectAtomicCss(cwd = process.cwd()) {
  const candidates = [
    { engine: 'unocss', files: ['uno.config.ts', 'uno.config.js', 'uno.config.mjs', 'unocss.config.ts', 'unocss.config.js'] },
    { engine: 'tailwind', files: ['tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.cjs', 'tailwind.config.mjs'] },
  ];

  for (const { engine, files } of candidates) {
    for (const f of files) {
      const p = path.resolve(cwd, f);
      if (fs.existsSync(p)) {
        return { engine, configPath: p };
      }
    }
  }
  return null;
}

function packageIsInstalled(name) {
  try {
    require.resolve(name, { paths: [process.cwd()] });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure a PostCSS config exists that wires up the detected engine.
 * Parcel's default config reads .postcssrc / postcss.config.js from project root.
 * We only generate one if the user has NOT provided their own — never overwrite.
 */
export function ensureAtomicCssPostCss(cwd = process.cwd()) {
  const detected = detectAtomicCss(cwd);
  if (!detected) return null;

  const { engine } = detected;
  const postcssPaths = [
    path.join(cwd, 'postcss.config.js'),
    path.join(cwd, 'postcss.config.cjs'),
    path.join(cwd, 'postcss.config.mjs'),
    path.join(cwd, '.postcssrc'),
    path.join(cwd, '.postcssrc.js'),
    path.join(cwd, '.postcssrc.json'),
  ];
  const hasPostcssConfig = postcssPaths.some(p => fs.existsSync(p));

  if (engine === 'tailwind') {
    const hasTw = packageIsInstalled('tailwindcss');
    if (!hasTw) {
      logger.warn('tailwind.config.* detected but `tailwindcss` is not installed');
      logger.detail('run: npm i -D tailwindcss');
      return { engine, configPath: detected.configPath, wired: false };
    }
    if (!hasPostcssConfig) {
      const configPath = path.join(cwd, '.postcssrc.json');
      fs.writeFileSync(configPath, JSON.stringify({
        plugins: { tailwindcss: {}, autoprefixer: {} },
      }, null, 2));
      logger.success(`Tailwind CSS auto-wired → ${path.relative(cwd, configPath)}`);
      return { engine, configPath: detected.configPath, wired: true };
    }
    logger.info('Tailwind CSS detected (existing PostCSS config preserved)');
    return { engine, configPath: detected.configPath, wired: false };
  }

  if (engine === 'unocss') {
    const hasPostcss = packageIsInstalled('@unocss/postcss');
    if (!hasPostcss) {
      logger.warn('uno.config.* detected but `@unocss/postcss` is not installed');
      logger.detail('run: npm i -D unocss @unocss/postcss');
      return { engine, configPath: detected.configPath, wired: false };
    }
    if (!hasPostcssConfig) {
      const configPath = path.join(cwd, '.postcssrc.json');
      fs.writeFileSync(configPath, JSON.stringify({
        plugins: { '@unocss/postcss': {} },
      }, null, 2));
      logger.success(`UnoCSS auto-wired → ${path.relative(cwd, configPath)}`);
      return { engine, configPath: detected.configPath, wired: true };
    }
    logger.info('UnoCSS detected (existing PostCSS config preserved)');
    return { engine, configPath: detected.configPath, wired: false };
  }

  return null;
}
