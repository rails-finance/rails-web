// Preloaded (`--require`) by a tsx render whose components read a content
// `.yaml` file: tsx compiles the app's imports to CommonJS, so the file loads
// through a require hook, parsed as scripts/yaml-loader.cjs parses it for the app.
const { readFileSync } = require("node:fs");
const { parseContent } = require("../yaml-loader.cjs");

require.extensions[".yaml"] = (module, filename) => {
  module.exports = { __esModule: true, default: parseContent(readFileSync(filename, "utf8")) };
};
