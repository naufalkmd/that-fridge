// Learn more: https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch the whole monorepo so edits in packages/* trigger reloads.
// (node-linker=hoisted in the root .npmrc keeps dependency resolution flat.)
config.watchFolders = [workspaceRoot];

module.exports = withNativeWind(config, { input: "./src/global.css" });
