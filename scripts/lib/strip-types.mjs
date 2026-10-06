// Load the app's TypeScript from a script: re-exec once under Node's type
// stripping with a resolver for the `@/` alias, extensionless imports, JSON
// imports (given their attribute) and content `.yaml` files (parsed by
// scripts/yaml-loader.cjs, as the app's webpack rule parses them).
//
//   import { withTypeStripping } from "./lib/strip-types.mjs";
//   withTypeStripping(import.meta.url);   // returns only in the re-exec'd child

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "../..");

export function withTypeStripping(scriptUrl) {
  if (process.execArgv.includes("--experimental-strip-types")) return;
  const hook = `
    import { existsSync, readFileSync } from "node:fs";
    import { createRequire } from "node:module";
    const ROOT = ${JSON.stringify(new URL("file://" + ROOT + "/").href)};
    const EXT = [".ts", ".tsx", "/index.ts", "/index.tsx", ".mjs", ".js"];
    export async function resolve(spec, ctx, next) {
      let s = spec;
      if (s.startsWith("@/")) s = new URL(s.slice(2), ROOT).href;
      if (s.startsWith(".") || s.startsWith("file:")) {
        const base = s.startsWith("file:") ? s : new URL(s, ctx.parentURL).href;
        if (base.endsWith(".json")) {
          const r = await next(base, ctx);
          return { ...r, importAttributes: { type: "json" } };
        }
        if (!/\\.(ts|tsx|mjs|js|yaml)$/.test(base)) {
          for (const e of EXT) if (existsSync(new URL(base + e))) return next(base + e, ctx);
        }
        return next(base, ctx);
      }
      return next(spec, ctx);
    }
    export async function load(url, ctx, next) {
      if (url.startsWith("file:") && url.endsWith(".yaml")) {
        const { toModule } = createRequire(ROOT)("./scripts/yaml-loader.cjs");
        return { format: "module", source: toModule(readFileSync(new URL(url), "utf8")), shortCircuit: true };
      }
      return next(url, ctx);
    }`;
  const register = `import{register}from'node:module';register(${JSON.stringify(
    "data:text/javascript," + encodeURIComponent(hook),
  )},import.meta.url);`;
  const r = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--disable-warning=ExperimentalWarning",
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      "--import",
      "data:text/javascript," + encodeURIComponent(register),
      fileURLToPath(scriptUrl),
      ...process.argv.slice(2),
    ],
    { stdio: "inherit", env: process.env },
  );
  process.exit(r.status ?? 1);
}
