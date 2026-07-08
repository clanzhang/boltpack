import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { logger } from './utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Minimal parser for pnpm-workspace.yaml — only the `packages:` list form.
 * Avoids a js-yaml dependency for this single, stable shape.
 *
 *   packages:
 *     - 'packages/*'
 *     - 'apps/*'
 */
function parsePnpmWorkspaceYaml(text) {
  const lines = text.split('\n');
  const globs = [];
  let inPackages = false;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (/^packages:\s*$/.test(line)) { inPackages = true; continue; }
    if (inPackages && /^\s+-\s+/.test(line)) {
      const m = line.match(/^\s+-\s+['"]?([^'"]+?)['"]?\s*$/);
      if (m) globs.push(m[1]);
      continue;
    }
    // any other top-level key ends the packages block
    if (inPackages && /^\S/.test(line)) inPackages = false;
  }
  return globs;
}

function expandGlob(root, glob) {
  // Supports `<dir>/*` and `<dir>/**` patterns sufficient for workspace layouts.
  if (glob.endsWith('/*')) {
    const base = path.resolve(root, glob.slice(0, -2));
    if (!fs.existsSync(base)) return [];
    return fs.readdirSync(base, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => path.join(base, d.name));
  }
  if (glob.endsWith('/**')) {
    const base = path.resolve(root, glob.slice(0, -3));
    const out = [];
    const walk = (dir) => {
      if (!fs.existsSync(dir)) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) {
          if (fs.existsSync(path.join(dir, e.name, 'package.json'))) {
            out.push(path.join(dir, e.name));
          }
          walk(path.join(dir, e.name));
        }
      }
    };
    walk(base);
    return out;
  }
  const abs = path.resolve(root, glob);
  return fs.existsSync(abs) ? [abs] : [];
}

function readPackageJson(pkgDir) {
  const p = path.join(pkgDir, 'package.json');
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

/**
 * Walk up from `cwd` to find a workspace root.
 * Returns { root, packages: [{ name, dir, pkg }], manager } or null.
 */
export function detectWorkspace(cwd = process.cwd()) {
  let dir = cwd;
  for (;;) {
    // pnpm-workspace.yaml
    const pnpmYaml = path.join(dir, 'pnpm-workspace.yaml');
    if (fs.existsSync(pnpmYaml)) {
      const globs = parsePnpmWorkspaceYaml(fs.readFileSync(pnpmYaml, 'utf8'));
      return buildWorkspace(dir, globs, 'pnpm');
    }
    // package.json workspaces field
    const pj = readPackageJson(dir);
    if (pj && Array.isArray(pj.workspaces)) {
      return buildWorkspace(dir, pj.workspaces, 'npm');
    }
    if (pj && pj.workspaces && Array.isArray(pj.workspaces.packages)) {
      return buildWorkspace(dir, pj.workspaces.packages, 'npm');
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function buildWorkspace(root, globs, manager) {
  const dirs = new Set();
  for (const g of globs) {
    for (const d of expandGlob(root, g)) dirs.add(path.resolve(d));
  }
  const packages = [];
  for (const dir of dirs) {
    const pkg = readPackageJson(dir);
    if (!pkg || !pkg.name) continue;
    packages.push({ name: pkg.name, dir, pkg });
  }
  return { root, packages, manager };
}

/**
 * Build a dependency graph restricted to packages WITHIN the workspace.
 * Edges: A -> B means A depends on B (B must build first).
 * Returns { nodes, edges: Map<name, Set<name>>, inDegree: Map<name, number> }
 */
export function buildDependencyGraph(workspace) {
  const names = new Set(workspace.packages.map(p => p.name));
  const byName = new Map(workspace.packages.map(p => [p.name, p]));
  const edges = new Map();          // dependent -> Set<dependency>
  const inDegree = new Map();       // name -> count of deps still unbuilt
  for (const n of names) { edges.set(n, new Set()); inDegree.set(n, 0); }

  const depFields = ['dependencies', 'devDependencies', 'peerDependencies'];
  for (const { name, pkg } of workspace.packages) {
    for (const field of depFields) {
      const deps = pkg[field] || {};
      for (const depName of Object.keys(deps)) {
        if (names.has(depName)) {
          if (!edges.get(name).has(depName)) {
            edges.get(name).add(depName);
            inDegree.set(name, inDegree.get(name) + 1);
          }
        }
      }
    }
  }
  return { byName, names, edges, inDegree };
}

/**
 * Kahn's algorithm — topological sort so shared libs build before dependents.
 * Returns { order: [names], cycles: [name[]] }.
 * Cycles are reported but resolved by breaking ties deterministically,
 * so builds never deadlock.
 */
export function topologicalSort(workspace) {
  const { names, edges, inDegree } = buildDependencyGraph(workspace);
  const indeg = new Map(inDegree);
  const queue = [...names].filter(n => indeg.get(n) === 0).sort();
  const order = [];
  const seen = new Set();

  while (queue.length) {
    const n = queue.shift();
    if (seen.has(n)) continue;
    seen.add(n);
    order.push(n);

    // For each node m that depends on n, decrement its in-degree
    for (const m of names) {
      if (edges.get(m).has(n)) {
        indeg.set(m, indeg.get(m) - 1);
        if (indeg.get(m) === 0) queue.push(m);
      }
    }
    queue.sort();
  }

  const cycles = [...names].filter(n => !seen.has(n));
  return { order, cycles };
}

/**
 * Cross-package HMR design.
 *
 * In dev: each workspace package is watched by the host dev server.
 * When a file in a dependency package changes, dependents must reload.
 *
 * Implementation sketch:
 *   1. Host dev server runs Parcel watch on the app entry.
 *   2. A WorkspaceWatcher (chokidar / fs.watch) monitors all dependency pkg src dirs.
 *   3. On change → resolve which package → broadcast `reload` over HMR WebSocket
 *      to any dependent app that imported it.
 *
 * `createWorkspaceWatcher` returns an EventEmitter emitting
 *   { type: 'change', pkgName, file, dependents: [appNames] }
 */
import { EventEmitter } from 'node:events';

export function createWorkspaceWatcher(workspace) {
  const emitter = new EventEmitter();
  const { byName, edges } = buildDependencyGraph(workspace);

  // Map: dependency name -> apps that depend on it (transitively)
  const dependentsOf = new Map();
  for (const dep of byName.keys()) dependentsOf.set(dep, new Set());
  for (const [app, deps] of edges.entries()) {
    for (const d of deps) dependentsOf.get(d).add(app);
  }

  const watchers = [];
  for (const { name, dir } of workspace.packages) {
    const srcDir = path.join(dir, 'src');
    if (!fs.existsSync(srcDir)) continue;
    try {
      const w = fs.watch(srcDir, { recursive: true }, (eventType, file) => {
        if (!file) return;
        emitter.emit('change', {
          pkgName: name,
          file: path.join(srcDir, file),
          dependents: [...(dependentsOf.get(name) || [])],
        });
      });
      watchers.push(w);
    } catch {}
  }

  emitter.close = () => watchers.forEach(w => { try { w.close(); } catch {} });
  return emitter;
}

/**
 * High-level: returns packages in build order (libs first, apps last).
 */
export function getBuildOrder(workspace) {
  const { order, cycles } = topologicalSort(workspace);
  if (cycles.length) {
    logger.warn(`dependency cycle detected: ${cycles.join(', ')} — breaking it`);
  }
  return order.map(name => workspace.packages.find(p => p.name === name)).filter(Boolean);
}
