const path = require('path');
const { Resolver } = require('@parcel/plugin');

let aliasConfig = {};
let projectRoot = '';

function setAliasConfig(alias, root) {
  aliasConfig = alias || {};
  projectRoot = root;
}

module.exports = new Resolver({
  resolve({ specifier }) {
    if (!specifier || specifier.startsWith('.') || specifier.startsWith('/')) {
      return null;
    }

    for (const [aliasKey, aliasValue] of Object.entries(aliasConfig)) {
      if (specifier === aliasKey) {
        const basePath = path.isAbsolute(aliasValue)
          ? aliasValue
          : path.resolve(projectRoot, aliasValue);
        return { filePath: basePath };
      }

      if (specifier.startsWith(aliasKey + '/')) {
        const rest = specifier.slice(aliasKey.length + 1);
        const basePath = path.isAbsolute(aliasValue)
          ? aliasValue
          : path.resolve(projectRoot, aliasValue);
        return { filePath: path.join(basePath, rest) };
      }
    }

    return null;
  },
});

module.exports.setAliasConfig = setAliasConfig;
