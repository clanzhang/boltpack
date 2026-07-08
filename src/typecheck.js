import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import pc from 'picocolors';
import { logger } from './utils/logger.js';

function resolveTsc(cwd) {
  const local = path.resolve(cwd, 'node_modules', '.bin', 'tsc');
  if (fs.existsSync(local)) return local;
  return 'tsc';
}

/**
 * Start a non-blocking `tsc --noEmit --watch` subprocess.
 * Returns a handle with `.stop()`. Type errors are streamed to logger
 * without ever rejecting or blocking the HMR pipeline.
 */
export function startTypeWatch(cwd = process.cwd()) {
  const tsconfigPath = path.resolve(cwd, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) {
    return null;
  }

  const tscBin = resolveTsc(cwd);
  const child = spawn(tscBin, ['--noEmit', '--watch', '--pretty', 'false'], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  let buffer = '';

  const flush = (stream) => {
    const lines = stream.split('\n');
    stream = lines.pop() || '';
    for (const raw of lines) {
      handleLine(raw);
    }
    return stream;
  };

  const handleLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // tsc watch status lines
    if (/File change detected/.test(trimmed)) return;
    if (/Starting compilation in watch mode/i.test(trimmed)) {
      logger.timestamp(pc.dim('typecheck watching…'));
      return;
    }
    if (/Compilation complete/i.test(trimmed) || /Found 0 errors/i.test(trimmed)) {
      return; // silent on success — keep terminal clean
    }

    // error line: file(line,col): error TSxxxx: message
    const m = trimmed.match(/^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s*(.+)$/);
    if (m) {
      const [, file, ln, col, sev, code, msg] = m;
      const loc = pc.dim(`${path.relative(cwd, file)}:${ln}:${col}`);
      const tag = sev === 'error' ? pc.red('TS error') : pc.yellow('TS warn');
      logger.raw(`  ${pc.dim('·')} ${tag} ${pc.dim(code)}  ${loc}`);
      logger.raw(`    ${sev === 'error' ? pc.red(msg) : pc.yellow(msg)}`);
      return;
    }

    // summary line: "Found N errors. Watching for file changes."
    if (/Found (\d+) error/.test(trimmed)) {
      const count = parseInt(trimmed.match(/Found (\d+) error/)[1], 10);
      if (count > 0) {
        logger.raw(`  ${pc.dim('·')} ${pc.red(`${count} type error(s) — see above`)}`);
      }
      return;
    }

    // fallback
    logger.raw(`  ${pc.dim('·')} ${pc.dim(trimmed)}`);
  };

  child.stdout.on('data', (chunk) => { buffer = flush(buffer + chunk.toString()); });
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    text.split('\n').forEach(line => {
      if (line.trim()) logger.raw(`  ${pc.dim('·')} ${pc.red(line.trim())}`);
    });
  });

  child.on('error', () => {
    // swallow — typecheck is best-effort and must never break dev
  });

  return {
    stop() {
      try { child.kill('SIGTERM'); } catch {}
    },
  };
}

/**
 * One-shot type declaration generation for library mode.
 * Resolves a promise regardless of tsc errors (declarations are best-effort).
 */
export function generateDeclarations(cwd = process.cwd(), outDir = 'dist') {
  return new Promise((resolve) => {
    const tsconfigPath = path.resolve(cwd, 'tsconfig.json');
    if (!fs.existsSync(tsconfigPath)) {
      resolve({ ok: false, reason: 'no tsconfig.json' });
      return;
    }

    const tscBin = resolveTsc(cwd);
    const absOut = path.resolve(cwd, outDir);
    const child = spawn(tscBin, [
      '--emitDeclarationOnly',
      '--declaration',
      '--outDir', absOut,
    ], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    let stderr = '';
    child.stderr.on('data', (c) => { stderr += c.toString(); });
    child.on('error', () => resolve({ ok: false, reason: 'tsc spawn failed' }));
    child.on('close', (code) => {
      resolve({ ok: code === 0, stderr });
    });
  });
}
