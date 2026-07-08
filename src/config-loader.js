import path from 'node:path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_CONFIG = path.resolve(__dirname, '..', 'node_modules', '@parcel', 'config-default');
const ALIAS_CONFIG = path.resolve(__dirname, 'parcel-config', 'index.json');

export function getCustomConfigPath(alias) {
  const hasAlias = alias && Object.keys(alias).length > 0;
  return hasAlias ? ALIAS_CONFIG : DEFAULT_CONFIG;
}
