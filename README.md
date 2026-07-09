# boltpack

A fast frontend build & dev CLI tool based on Parcel Node API and Lightning CSS — with an open plugin system, monorepo workspace, module federation and SSR/SSG support.

## Features

### Core
- **Zero-config build** — Powered by `@parcel/core` with Lightning CSS for CSS parsing and minification
- **Dev server + HMR** — Built-in hot module replacement with WebSocket
- **Bundle analyzer** — Visualize output size with `--analyze`
- **Path alias** — Resolve `@/components/Button.js` via custom Parcel resolver plugin
- **API proxy** — Reverse proxy for local development with `http-proxy-middleware`
- **Static assets** — Auto-copy `public/` directory to output on build
- **Config file** — `boltpack.config.js` for project-level defaults
- **Cache control** — `--no-cache` flag and `clean` command
- **NODE_ENV injection** — Automatic dead code elimination for React/Vue production builds
- **Browser compatibility** — Configurable via `engines.browsers` (autoprefixer via Lightning CSS)

### Advanced
- **Library mode** (`--lib`) — Emit ESM + CJS + `.d.ts` from a JS/TS entry
- **Parallel TypeScript typecheck** — Non-blocking `tsc --noEmit --watch` in dev
- **Interactive CLI** — `@clack/prompts` guided menu when invoked with no args
- **Minimalist terminal UI** — Apple-style logger on `picocolors`
- **Atomic CSS auto-wire** — Detects `uno.config.*` / `tailwind.config.*` and injects PostCSS config

### Enterprise
- **Plugin system** — `setup` / `beforeBuild` / `transform` / `afterBuild` lifecycle hooks
- **Monorepo workspace** — pnpm/npm workspace detection + DAG topological build ordering
- **Module federation** — URL-based remote module loader + shared singleton registry
- **SSR / SSG** — Dual client+server build pipeline with isomorphic prerendering

## Requirements

- Node.js >= 18

## Installation

```bash
# Clone or create the project, then:
npm install

# Link globally for local debugging
npm link
```

For TypeScript features (library `.d.ts` emission, dev typecheck):

```bash
npm i -D typescript
```

## Usage

### Interactive mode (no arguments)

```bash
boltpack
```

Opens a `@clack/prompts` menu: **Dev / Build / Build library / Clean** — then guides you through entry and port input.

### Build (default command)

```bash
# Production build (default)
boltpack src/index.html

# Development mode build
boltpack src/index.html -m development

# Custom output directory
boltpack src/index.html -o build

# Disable cache
boltpack src/index.html --no-cache

# Enable bundle size analysis (production only)
boltpack src/index.html --analyze

# Library mode — ESM + CJS + .d.ts
boltpack src/index.ts --lib

# SSR/SSG — dual client+server build with prerendering
boltpack src/index.html --ssr --routes /,/about,/blog
```

#### Build options

| Flag | Description | Default |
|------|-------------|---------|
| `<entry>` | Entry file (required unless interactive) | — |
| `-m, --mode <mode>` | `production` or `development` | `production` |
| `-o, --out-dir <dir>` | Output directory | `dist` |
| `--no-cache` | Disable Parcel cache | `false` |
| `-a, --analyze` | Generate bundle analysis report | `false` |
| `--lib` | Library mode (JS/TS entry → ESM + CJS + `.d.ts`) | `false` |
| `--ssr` | SSR/SSG dual build with prerendering | `false` |
| `--routes <routes>` | Comma-separated routes to prerender (with `--ssr`) | `/` |

### Dev server

```bash
# Start dev server with HMR + parallel typecheck (default port 3000)
boltpack dev src/index.html

# Custom port
boltpack dev src/index.html -p 8080

# Disable cache
boltpack dev src/index.html --no-cache
```

#### Dev options

| Flag | Description | Default |
|------|-------------|---------|
| `<entry>` | Entry file (required) | — |
| `-p, --port <port>` | Dev server port | `3000` |
| `-o, --out-dir <dir>` | Output directory | `dist` |
| `--no-cache` | Disable Parcel cache | `false` |

### Clean

```bash
# Remove .parcel-cache and dist
boltpack clean

# Clean a custom output directory
boltpack clean -o build
```

## Configuration File

Create a `boltpack.config.js` in your project root:

```js
export default {
  port: 4000,
  publicDir: 'static',
  alias: {
    '@': './src',
    '@components': './src/components',
  },
  proxy: {
    '/api': 'http://localhost:8080',
    '/ws': { target: 'http://localhost:8080', changeOrigin: true },
  },
  plugins: [
    {
      name: 'pwa',
      afterBuild(ctx) {
        ctx.emitFile('manifest.webmanifest', JSON.stringify({
          name: 'My App',
          short_name: 'App',
          display: 'standalone',
        }));
      },
    },
  ],
  federation: {
    name: 'host',
    remotes: { app1: 'https://cdn.example.com/remote-app1/remoteEntry.js' },
    shared: { react: { singleton: true, requiredVersion: '^18.0.0' } },
  },
};
```

### Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `port` | `number` | `3000` | Dev server port |
| `publicDir` | `string` | `'public'` | Static assets directory, copied to output on build |
| `alias` | `Record<string, string>` | `{}` | Path alias mapping |
| `proxy` | `Record<string, string \| object>` | `{}` | API reverse proxy config |
| `plugins` | `Plugin[]` | `[]` | Plugin objects / factory functions / module paths |
| `federation` | `object` | `undefined` | Module federation manifest |

**Priority**: CLI flags > config file > defaults

## Path Alias

Configure alias in `boltpack.config.js`:

```js
export default {
  alias: { '@': './src' },
};
```

Then in your code:

```js
import { Button } from '@/components/Button.js';
// Resolves to ./src/components/Button.js
```

The alias resolver is implemented as a custom Parcel resolver plugin at [src/parcel-config/resolver-alias.cjs](src/parcel-config/resolver-alias.cjs), injected via a dynamic Parcel config — no `.parcelrc` needed.

## API Proxy

Configure proxy in `boltpack.config.js`:

```js
export default {
  proxy: {
    '/api': 'http://localhost:8080',
  },
};
```

Frontend requests to `/api/*` are forwarded to `http://localhost:8080/api/*`. The dev server wraps Parcel's internal server with `http-proxy-middleware`, automatically falling back to a free port if the configured port is in use.

## Static Assets

Place static files in the `publicDir` (default: `public/`):

```
public/
  ├── robots.txt
  └── manifest.json
```

After build, they are copied to the output directory:

```
dist/
  ├── index.html          ← Parcel output
  ├── main.abc123.js      ← Parcel output
  ├── robots.txt          ← Copied from public/
  └── manifest.json       ← Copied from public/
```

## NODE_ENV Injection

- `boltpack build` sets `NODE_ENV=production`
- `boltpack dev` sets `NODE_ENV=development`

This is passed to Parcel via the `env` option, enabling compile-time constant folding. React/Vue dev-only code (warnings, devtools) is tree-shaken in production builds.

## Browser Compatibility

Lightning CSS autoprefixer targets are configured via `defaultTargetOptions.engines.browsers`:

```js
['> 0.5%', 'last 2 versions', 'not dead']
```

## Library Mode (`--lib`)

Build a JS/TS entry as a publishable NPM package with dual-format output:

```bash
boltpack src/index.ts --lib
```

Produces in `dist/`:
- `index.js` — CommonJS (`main` target, scope-hoisted)
- `index.module.js` — ESModule (`module` target, scope-hoisted)
- `index.d.ts` — Type declarations via `tsc --emitDeclarationOnly`

The entry must be a `.js`/`.ts`/`.jsx`/`.tsx`/`.mjs`/`.cjs` file. HTML entries are rejected in library mode — drop `--lib` for app builds.

## TypeScript Typecheck

In `boltpack dev`, if a `tsconfig.json` exists, a non-blocking `tsc --noEmit --watch` subprocess runs in parallel:

- Type errors are streamed to the terminal with `file:line:col` locations
- Success is silent (keeps the terminal clean)
- The HMR pipeline is never blocked — typecheck errors never reject or abort builds
- `SIGINT`/`SIGTERM` gracefully tear down the subprocess

For library builds, `tsc --emitDeclarationOnly --declaration --outDir dist` runs after the Parcel build.

## Atomic CSS Auto-Wire

On dev/build, boltpack probes for atomic CSS engine config files:

| Detected file | Engine | Auto-injected PostCSS plugin |
|---------------|--------|------------------------------|
| `tailwind.config.{js,ts,cjs,mjs}` | Tailwind | `tailwindcss` + `autoprefixer` |
| `uno.config.{ts,js,mjs}` / `unocss.config.*` | UnoCSS | `@unocss/postcss` |

If the user has **no** existing PostCSS config (`.postcssrc` / `postcss.config.*`), boltpack generates a minimal `.postcssrc.json` wiring the detected engine. Existing PostCSS configs are **never** overwritten. Missing runtime packages (`tailwindcss`, `@unocss/postcss`) produce a warning with install instructions.

## Plugin System

Plugins extend the build lifecycle via four hooks:

```js
{
  name: 'banner',
  async setup(ctx)            { /* parallel init */ },
  async beforeBuild(ctx)      { /* serial, ordered */ },
  async transform(asset)      { /* serial pipeline: asset = { fileName, filePath, code, type } */ return asset; },
  async afterBuild(ctx)       { /* parallel post-build: ctx.emitFile('manifest.json', ...) */ },
}
```

| Hook | Concurrency | Purpose |
|------|-------------|---------|
| `setup` | Parallel | Plugin initialization |
| `beforeBuild` | Serial (ordered) | Pre-build side effects |
| `transform` | Serial pipeline | Per-asset code mutation (AST / minify / banner) |
| `afterBuild` | Parallel | Independent post-processing (PWA manifest, sitemap) |

`PluginContext` exposes:
- `ctx.assets` — emitted asset descriptors (`{ fileName, filePath, code, type }`)
- `ctx.readAsset(fileName)` — read an emitted asset's source
- `ctx.emitFile(fileName, content)` — write a synthetic file into the output dir
- `ctx.emittedFiles` — list of files written by plugins
- `ctx.errors` — collected errors (plugins never abort the main build)

Declare plugins in `boltpack.config.js` as objects, factory functions, or module paths.

## Monorepo Workspace

boltpack auto-detects monorepo roots by walking up the directory tree for:
- `pnpm-workspace.yaml` (parsed with a built-in minimal YAML parser — no `js-yaml` dependency)
- `package.json` with a `workspaces` field (array or `{ packages }`)

```bash
boltpack src/index.html
# → workspace: 6 packages · pnpm
# → build order: @app/ui → @app/utils → @app/web → @app/admin
```

Internals:
- `detectWorkspace(cwd)` — finds the root and expands workspace globs (`packages/*`, `apps/**`)
- `buildDependencyGraph` — restricts edges to packages **within** the workspace
- `topologicalSort` — Kahn's algorithm with deterministic tie-breaking; cycles are detected and broken (builds never deadlock)
- `createWorkspaceWatcher` — watches dependency package `src/` dirs; on change, resolves dependents and broadcasts reload over the HMR WebSocket

## Module Federation

Declare federation in `boltpack.config.js`:

```js
export default {
  federation: {
    name: 'host',
    remotes: {
      app1: 'https://cdn.example.com/remote-app1/remoteEntry.js',
    },
    exposes: { './Button': './src/Button' },
    shared: {
      react: { singleton: true, requiredVersion: '^18.0.0' },
      'react-dom': { singleton: true },
    },
  },
};
```

Runtime API (imported inside the host app):

```js
import { federationRuntime } from '@boltpack/federation/runtime';

await federationRuntime.init(manifest);

// Dynamically load a remote module by URL
const Button = await federationRuntime.loadRemote('app1', './Button');

// Shared singletons — first registration wins
federationRuntime.registerShared('react', '18.2.0', ReactInstance, { singleton: true });
const React = federationRuntime.loadShared('react', localReactFallback);
```

Two layers:
- **Build-time**: `defineFederation(config)` produces a manifest; `buildRuntimeBootstrap(manifest)` emits a JS snippet that calls `federationRuntime.init()`
- **Runtime**: `federationRuntime` provides `loadRemote`, `loadShared`, `registerShared` with a `remoteCache` (URL → module promise) and `sharedRegistry` (singleton negotiation)

## SSR / SSG (`--ssr`)

Build dual client + server bundles, then prerender static HTML per route.

```bash
boltpack src/index.html --ssr --routes /,/about,/blog
```

**Requires** a server entry co-located with the client entry, exporting a `render` function:
- `src/entry-server.{ts,tsx,js,jsx}`, or
- `src/index.server.{ext}`, or derived from the client entry name

```js
// src/entry-server.jsx
import { renderToString } from 'react-dom/server';
import App from './App';
export function render({ url }) {
  return renderToString(<App url={url} />);
}
```

Output layout:

```
dist/
  ├── client/              ← browser bundle (hydration)
  │   ├── index.html       ← prerendered shell + injected HTML
  │   ├── about/index.html ← prerendered route
  │   └── *.js
  └── server/
      └── index.cjs        ← Node CJS bundle exposing render()
```

Pipeline:
1. **Client build** — Parcel `browser` target → `dist/client/`
2. **Server build** — Parcel `node` target (CJS, `includeNodeModules`) → `dist/server/`
3. **Prerender** — dynamic-import the server bundle, call `render({ url })` per route, inject the result into the client HTML shell (`<!--app-->` or `#root`), write `dist/client/<route>/index.html`

## Project Structure

```
boltpack/
├── bin/
│   └── index.js                    # CLI entry (commander + @clack/prompts)
├── src/
│   ├── build.js                    # Production build + plugin lifecycle + lib mode
│   ├── dev.js                      # Dev server + HMR + proxy + typecheck
│   ├── clean.js                    # Cache & output cleanup
│   ├── config.js                   # Config file loader
│   ├── config-loader.js            # Parcel config path resolver
│   ├── plugins.js                  # PluginManager + PluginContext
│   ├── workspace.js                # Monorepo detection + DAG topological sort
│   ├── federation.js               # Module federation runtime loader
│   ├── ssr.js                      # SSR/SSG dual build + prerender
│   ├── typecheck.js                # tsc --noEmit --watch subprocess
│   ├── atomic-css.js               # Tailwind/UnoCSS auto-detection
│   ├── parcel-config/
│   │   ├── index.json              # Custom Parcel config (with alias resolver)
│   │   └── resolver-alias.cjs      # Path alias resolver plugin
│   └── utils/
│       └── logger.js               # Minimalist picocolors logger
├── test/
│   └── fixtures/                   # Test fixtures
└── package.json
```

## License

[MIT](LICENSE)

