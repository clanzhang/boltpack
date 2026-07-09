# boltpack

基于 Parcel Node API 和 Lightning CSS 的快速前端构建与开发 CLI 工具 — 支持开放插件系统、Monorepo 工作区、模块联邦和 SSR/SSG。

## 功能特性

### 核心功能
- **零配置构建** — 基于 `@parcel/core`，使用 Lightning CSS 进行 CSS 解析和压缩
- **开发服务器 + HMR** — 内置基于 WebSocket 的热模块替换
- **Bundle 分析** — 使用 `--analyze` 可视化输出大小
- **路径别名** — 通过自定义 Parcel resolver 插件解析 `@/components/Button.js`
- **API 代理** — 使用 `http-proxy-middleware` 进行本地开发反向代理
- **静态资源** — 构建时自动复制 `public/` 目录到输出目录
- **配置文件** — `boltpack.config.js` 项目级默认配置
- **缓存控制** — `--no-cache` 标志和 `clean` 命令
- **NODE_ENV 注入** — 自动为 React/Vue 生产构建进行死代码消除
- **浏览器兼容性** — 通过 `engines.browsers` 配置（Lightning CSS 自动添加前缀）

### 进阶功能
- **库打包模式** (`--lib`) — 从 JS/TS 入口输出 ESM + CJS + `.d.ts`
- **并行 TypeScript 类型检查** — 开发模式下无阻塞运行 `tsc --noEmit --watch`
- **交互式 CLI** — 无参数调用时显示 `@clack/prompts` 引导菜单
- **极简终端 UI** — 基于 `picocolors` 的 Apple 风格日志输出
- **原子化 CSS 自动挂载** — 自动检测 `uno.config.*` / `tailwind.config.*` 并注入 PostCSS 配置

### 企业级架构
- **插件系统** — `setup` / `beforeBuild` / `transform` / `afterBuild` 生命周期钩子
- **Monorepo 工作区** — pnpm/npm workspace 自动检测 + DAG 拓扑排序构建顺序
- **模块联邦** — 基于 URL 的远程模块加载器 + 共享单例注册表
- **SSR / SSG** — 双端（客户端+服务端）构建管线，支持同构预渲染

## 环境要求

- Node.js >= 18

## 安装

```bash
# 克隆或创建项目后：
npm install

# 全局链接以便本地调试
npm link
```

如需使用 TypeScript 特性（库模式 `.d.ts` 生成、开发模式类型检查）：

```bash
npm i -D typescript
```

## 使用方法

### 交互模式（无参数）

```bash
boltpack
```

打开 `@clack/prompts` 菜单：**开发 / 构建 / 库打包 / 清理** — 然后引导输入入口文件和端口。

### 构建（默认命令）

```bash
# 生产构建（默认）
boltpack src/index.html

# 开发模式构建
boltpack src/index.html -m development

# 自定义输出目录
boltpack src/index.html -o build

# 禁用缓存
boltpack src/index.html --no-cache

# 启用 Bundle 大小分析（仅生产模式）
boltpack src/index.html --analyze

# 库模式 — 输出 ESM + CJS + .d.ts
boltpack src/index.ts --lib

# SSR/SSG — 双端构建并预渲染
boltpack src/index.html --ssr --routes /,/about,/blog
```

#### 构建选项

| 参数 | 描述 | 默认值 |
|------|------|--------|
| `<entry>` | 入口文件（交互式模式除外） | — |
| `-m, --mode <mode>` | `production` 或 `development` | `production` |
| `-o, --out-dir <dir>` | 输出目录 | `dist` |
| `--no-cache` | 禁用 Parcel 缓存 | `false` |
| `-a, --analyze` | 生成 Bundle 分析报告 | `false` |
| `--lib` | 库模式（JS/TS 入口 → ESM + CJS + `.d.ts`） | `false` |
| `--ssr` | SSR/SSG 双端构建并预渲染 | `false` |
| `--routes <routes>` | 逗号分隔的预渲染路由（需配合 `--ssr`） | `/` |

### 开发服务器

```bash
# 启动开发服务器，带 HMR + 并行类型检查（默认端口 3000）
boltpack dev src/index.html

# 自定义端口
boltpack dev src/index.html -p 8080

# 禁用缓存
boltpack dev src/index.html --no-cache
```

#### 开发选项

| 参数 | 描述 | 默认值 |
|------|------|--------|
| `<entry>` | 入口文件 | — |
| `-p, --port <port>` | 开发服务器端口 | `3000` |
| `-o, --out-dir <dir>` | 输出目录 | `dist` |
| `--no-cache` | 禁用 Parcel 缓存 | `false` |

### 清理

```bash
# 删除 .parcel-cache 和 dist
boltpack clean

# 清理自定义输出目录
boltpack clean -o build
```

## 配置文件

在项目根目录创建 `boltpack.config.js`：

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

### 配置项

| 字段 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `port` | `number` | `3000` | 开发服务器端口 |
| `publicDir` | `string` | `'public'` | 静态资源目录，构建时复制到输出目录 |
| `alias` | `Record<string, string>` | `{}` | 路径别名映射 |
| `proxy` | `Record<string, string \| object>` | `{}` | API 反向代理配置 |
| `plugins` | `Plugin[]` | `[]` | 插件对象 / 工厂函数 / 模块路径 |
| `federation` | `object` | `undefined` | 模块联邦配置 |

**优先级**：CLI 参数 > 配置文件 > 默认值

## 路径别名

在 `boltpack.config.js` 中配置别名：

```js
export default {
  alias: { '@': './src' },
};
```

然后在代码中使用：

```js
import { Button } from '@/components/Button.js';
// 解析为 ./src/components/Button.js
```

别名解析器实现为自定义 Parcel resolver 插件，位于 [src/parcel-config/resolver-alias.cjs](src/parcel-config/resolver-alias.cjs)，通过动态 Parcel 配置注入 — 无需 `.parcelrc`。

## API 代理

在 `boltpack.config.js` 中配置代理：

```js
export default {
  proxy: {
    '/api': 'http://localhost:8080',
  },
};
```

前端对 `/api/*` 的请求会被转发到 `http://localhost:8080/api/*`。开发服务器使用 `http-proxy-middleware` 包装 Parcel 的内部服务器，如果配置的端口被占用，会自动回退到一个空闲端口。

## 静态资源

将静态文件放在 `publicDir`（默认：`public/`）目录下：

```
public/
  ├── robots.txt
  └── manifest.json
```

构建后，它们会被复制到输出目录：

```
dist/
  ├── index.html          ← Parcel 输出
  ├── main.abc123.js      ← Parcel 输出
  ├── robots.txt          ← 从 public/ 复制
  └── manifest.json       ← 从 public/ 复制
```

## NODE_ENV 注入

- `boltpack build` 设置 `NODE_ENV=production`
- `boltpack dev` 设置 `NODE_ENV=development`

通过 `env` 选项传递给 Parcel，启用编译时常量折叠。React/Vue 的开发环境代码（警告、调试工具）在生产构建中会被 tree-shake 掉。

## 浏览器兼容性

Lightning CSS 自动前缀的目标浏览器通过 `defaultTargetOptions.engines.browsers` 配置：

```js
['> 0.5%', 'last 2 versions', 'not dead']
```

## 库打包模式 (`--lib`)

将 JS/TS 入口构建为可发布的 NPM 包，支持双格式输出：

```bash
boltpack src/index.ts --lib
```

在 `dist/` 目录生成：
- `index.js` — CommonJS（`main` 目标，scope-hoisted）
- `index.module.js` — ESModule（`module` 目标，scope-hoisted）
- `index.d.ts` — TypeScript 类型声明（通过 `tsc --emitDeclarationOnly`）

入口必须是 `.js`/`.ts`/`.jsx`/`.tsx`/`.mjs`/`.cjs` 文件。库模式下不支持 HTML 入口 — 应用构建请去掉 `--lib`。

## TypeScript 类型检查

在 `boltpack dev` 中，如果存在 `tsconfig.json`，会并行启动一个无阻塞的 `tsc --noEmit --watch` 子进程：

- 类型错误会实时输出到终端，包含 `file:line:col` 位置信息
- 检查成功时静默（保持终端整洁）
- 绝不阻塞 HMR 管道 — 类型检查错误不会中断或中止构建
- `SIGINT`/`SIGTERM` 时优雅地关闭子进程

对于库模式构建，Parcel 构建完成后会执行 `tsc --emitDeclarationOnly --declaration --outDir dist`。

## 原子化 CSS 自动挂载

在开发/构建时，boltpack 会探测原子化 CSS 引擎的配置文件：

| 检测到的文件 | 引擎 | 自动注入的 PostCSS 插件 |
|--------------|------|------------------------|
| `tailwind.config.{js,ts,cjs,mjs}` | Tailwind | `tailwindcss` + `autoprefixer` |
| `uno.config.{ts,js,mjs}` / `unocss.config.*` | UnoCSS | `@unocss/postcss` |

如果用户**没有**现有的 PostCSS 配置（`.postcssrc` / `postcss.config.*`），boltpack 会自动生成一个最小化的 `.postcssrc.json`，挂载检测到的引擎。现有的 PostCSS 配置**永远不会**被覆盖。缺少运行时依赖包（`tailwindcss`、`@unocss/postcss`）会输出警告并提示安装命令。

## 插件系统

插件通过四个钩子扩展构建生命周期：

```js
{
  name: 'banner',
  async setup(ctx)            { /* 并行初始化 */ },
  async beforeBuild(ctx)      { /* 串行，按顺序执行 */ },
  async transform(asset)      { /* 串行管道：asset = { fileName, filePath, code, type } */ return asset; },
  async afterBuild(ctx)       { /* 并行后处理：ctx.emitFile('manifest.json', ...) */ },
}
```

| 钩子 | 并发模式 | 用途 |
|------|----------|------|
| `setup` | 并行 | 插件初始化 |
| `beforeBuild` | 串行（有序） | 构建前副作用 |
| `transform` | 串行管道 | 逐个资源的代码转换（AST / 压缩 / 横幅） |
| `afterBuild` | 并行 | 独立的后处理（PWA manifest、站点地图） |

`PluginContext` 暴露：
- `ctx.assets` — 已输出资源描述符（`{ fileName, filePath, code, type }`）
- `ctx.readAsset(fileName)` — 读取已输出资源的源代码
- `ctx.emitFile(fileName, content)` — 将合成文件写入输出目录
- `ctx.emittedFiles` — 插件写入的文件列表
- `ctx.errors` — 收集的错误（插件永远不会中止主构建）

在 `boltpack.config.js` 中声明插件，可以是对象、工厂函数或模块路径。

## Monorepo 工作区

boltpack 通过向上遍历目录树自动检测 Monorepo 根目录，支持：
- `pnpm-workspace.yaml`（使用内置的极简 YAML 解析器 — 无需 `js-yaml` 依赖）
- `package.json` 中的 `workspaces` 字段（数组或 `{ packages }` 格式）

```bash
boltpack src/index.html
# → workspace: 6 packages · pnpm
# → build order: @app/ui → @app/utils → @app/web → @app/admin
```

内部实现：
- `detectWorkspace(cwd)` — 查找根目录并展开 workspace glob（`packages/*`、`apps/**`）
- `buildDependencyGraph` — 将依赖关系限制在工作区内的包之间
- `topologicalSort` — Kahn 算法，带确定性 tie-breaking；检测并打破循环（构建永不死锁）
- `createWorkspaceWatcher` — 监听依赖包的 `src/` 目录；发生变化时，解析依赖链并通过 HMR WebSocket 广播重载

## 模块联邦

在 `boltpack.config.js` 中声明联邦配置：

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

运行时 API（在宿主应用中导入）：

```js
import { federationRuntime } from '@boltpack/federation/runtime';

await federationRuntime.init(manifest);

// 动态加载远程模块
const Button = await federationRuntime.loadRemote('app1', './Button');

// 共享单例 — 首次注册者胜出
federationRuntime.registerShared('react', '18.2.0', ReactInstance, { singleton: true });
const React = federationRuntime.loadShared('react', localReactFallback);
```

两层架构：
- **构建时**：`defineFederation(config)` 生成配置清单；`buildRuntimeBootstrap(manifest)` 输出调用 `federationRuntime.init()` 的 JS 代码片段
- **运行时**：`federationRuntime` 提供 `loadRemote`、`loadShared`、`registerShared`，包含 `remoteCache`（URL → 模块 Promise）和 `sharedRegistry`（单例协商）

## SSR / SSG (`--ssr`)

构建双端（客户端 + 服务端）Bundle，然后按路由预渲染静态 HTML。

```bash
boltpack src/index.html --ssr --routes /,/about,/blog
```

**需要**一个与客户端入口同级的服务端入口文件，导出 `render` 函数：
- `src/entry-server.{ts,tsx,js,jsx}`，或
- `src/index.server.{ext}`，或从客户端入口名称派生

```js
// src/entry-server.jsx
import { renderToString } from 'react-dom/server';
import App from './App';
export function render({ url }) {
  return renderToString(<App url={url} />);
}
```

输出目录结构：

```
dist/
  ├── client/              ← 浏览器 Bundle（用于 hydration）
  │   ├── index.html       ← 预渲染外壳 + 注入的 HTML
  │   ├── about/index.html ← 预渲染路由
  │   └── *.js
  └── server/
      └── index.cjs        ← Node CJS Bundle，暴露 render()
```

构建流程：
1. **客户端构建** — Parcel `browser` 目标 → `dist/client/`
2. **服务端构建** — Parcel `node` 目标（CJS，`includeNodeModules`）→ `dist/server/`
3. **预渲染** — 动态导入服务端 Bundle，对每个路由调用 `render({ url })`，将结果注入客户端 HTML 外壳（`<!--app-->` 或 `#root`），写入 `dist/client/<route>/index.html`

## 项目结构

```
boltpack/
├── bin/
│   └── index.js                    # CLI 入口（commander + @clack/prompts）
├── src/
│   ├── build.js                    # 生产构建 + 插件生命周期 + 库模式
│   ├── dev.js                      # 开发服务器 + HMR + 代理 + 类型检查
│   ├── clean.js                    # 缓存与输出清理
│   ├── config.js                   # 配置文件加载器
│   ├── config-loader.js            # Parcel 配置路径解析器
│   ├── plugins.js                  # PluginManager + PluginContext
│   ├── workspace.js                # Monorepo 检测 + DAG 拓扑排序
│   ├── federation.js               # 模块联邦运行时加载器
│   ├── ssr.js                      # SSR/SSG 双端构建 + 预渲染
│   ├── typecheck.js                # tsc --noEmit --watch 子进程
│   ├── atomic-css.js               # Tailwind/UnoCSS 自动检测
│   ├── parcel-config/
│   │   ├── index.json              # 自定义 Parcel 配置（带别名解析器）
│   │   └── resolver-alias.cjs      # 路径别名解析器插件
│   └── utils/
│       └── logger.js               # 极简 picocolors 日志器
├── test/
│   └── fixtures/                   # 测试用例
└── package.json
```

## 许可证

[MIT](LICENSE)
