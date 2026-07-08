# boltpack

A fast frontend build & dev CLI tool based on Parcel Node API and Lightning CSS.

## Features

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

## Requirements

- Node.js >= 18

## Installation

```bash
# Clone or create the project, then:
npm install

# Link globally for local debugging
npm link
```

## Usage

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
```

#### Build options

| Flag | Description | Default |
|------|-------------|---------|
| `<entry>` | Entry file (required) | — |
| `-m, --mode <mode>` | `production` or `development` | `production` |
| `-o, --out-dir <dir>` | Output directory | `dist` |
| `--no-cache` | Disable Parcel cache | `false` |
| `-a, --analyze` | Generate bundle analysis report | `false` |

### Dev server

```bash
# Start dev server with HMR (default port 3000)
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
};
```

### Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `port` | `number` | `3000` | Dev server port |
| `publicDir` | `string` | `'public'` | Static assets directory, copied to output on build |
| `alias` | `Record<string, string>` | `{}` | Path alias mapping |
| `proxy` | `Record<string, string \| object>` | `{}` | API reverse proxy config |

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

## Project Structure

```
boltpack/
├── bin/
│   └── index.js                    # CLI entry (commander)
├── src/
│   ├── build.js                    # Production build logic
│   ├── dev.js                      # Dev server + HMR + proxy
│   ├── clean.js                    # Cache & output cleanup
│   ├── config.js                   # Config file loader
│   ├── config-loader.js            # Parcel config path resolver
│   ├── parcel-config/
│   │   ├── index.json              # Custom Parcel config (with alias resolver)
│   │   └── resolver-alias.cjs      # Path alias resolver plugin
│   └── utils/
│       └── logger.js               # Colored terminal logger
├── test/
│   └── fixtures/                   # Test fixtures
└── package.json
```


