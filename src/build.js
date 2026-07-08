import { Parcel } from '@parcel/core';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function build({ entry, mode, outDir }) {
  const startTime = Date.now();

  const entryFilePath = path.resolve(process.cwd(), entry);
  const outDirPath = path.resolve(process.cwd(), outDir);

  const configPath = path.resolve(__dirname, '..', 'node_modules', '@parcel', 'config-default');

  const options = {
    entries: entryFilePath,
    config: configPath,
    mode: mode === 'production' ? 'production' : 'development',
    outDir: outDirPath,
    targets: {
      browser: {
        distDir: outDirPath
      }
    },
    defaultTargetOptions: {
      engines: {
        browsers: ['> 0.5%', 'last 2 versions', 'not dead']
      }
    }
  };

  const bundler = new Parcel(options);

  const { bundleGraph } = await bundler.run();

  const assets = [];
  bundleGraph.getBundles().forEach(bundle => {
    assets.push(path.relative(process.cwd(), bundle.filePath));
  });

  return {
    time: Date.now() - startTime,
    assets
  };
}
