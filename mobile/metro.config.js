const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const nodeModulesPath = path.resolve(projectRoot, 'node_modules');

const config = getDefaultConfig(projectRoot);

config.resolver.nodeModulesPaths = [nodeModulesPath];
config.resolver.extraNodeModules = new Proxy(
  {},
  {
    get: (_, name) => path.join(nodeModulesPath, String(name)),
  },
);

module.exports = config;
