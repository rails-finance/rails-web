// A content file (content/<protocol>/*.yaml) as a module whose default export
// is the parsed data. next.config.ts hands `.yaml` imports to this webpack
// loader; scripts/lib/strip-types.mjs calls `toModule` for the scripts that
// load the app's TypeScript, so the page, the exports and the checks read one
// parse of one file.

const YAML = require("yaml");

/** The file's data; a duplicate key or a syntax error throws with its line. */
function parseContent(src) {
  return YAML.parse(src, { uniqueKeys: true, prettyErrors: true });
}

function toModule(src) {
  return `export default ${JSON.stringify(parseContent(src))};\n`;
}

module.exports = function yamlLoader(src) {
  return toModule(src);
};
module.exports.parseContent = parseContent;
module.exports.toModule = toModule;
