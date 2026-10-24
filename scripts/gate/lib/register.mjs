// Loaded with `--import` after tsx, so the app's TypeScript runs outside
// Next: a `.yaml` content file becomes its parsed data (as next.config.ts's
// webpack rule and scripts/yaml-loader.cjs make it), and `server-only` is an
// empty module (as Next maps it outside the client bundle). tsx compiles the
// app's `.ts` files to CommonJS here, so both are installed on the CommonJS
// loader; the ESM hook covers a `server-only` import from an `.mjs` file.
//
//   node --import tsx --import ./scripts/gate/lib/register.mjs <script>

import { createRequire, register } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { parseContent } = require("../../yaml-loader.cjs");

require.extensions[".yaml"] = (module, filename) => {
  module.exports = { __esModule: true, default: parseContent(readFileSync(filename, "utf8")) };
};

const serverOnly = require.resolve("server-only");
require.cache[serverOnly] = { id: serverOnly, filename: serverOnly, loaded: true, exports: {} };

register(
  "data:text/javascript," +
    encodeURIComponent(
      `export async function resolve(spec, ctx, next) {
        if (spec === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
        return next(spec, ctx);
      }`,
    ),
  import.meta.url,
);
