// For a unit test of app code that imports through `@/`, by extensionless
// specifier, or reads a content `.yaml` file: registers the resolver
// scripts/lib/strip-types.mjs gives the scripts, in the test's own process.
//
//   import { registerAppResolver } from "../lib/app-resolver.mjs";
//   registerAppResolver();
//   const { L5 } = await import("../../lib/liquity/event-templates.ts");

import { register } from "node:module";

const ROOT = new URL("../../", import.meta.url).href;

const hooks = `
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
const ROOT = ${JSON.stringify(ROOT)};
const EXT = [".ts", "/index.ts", ".mjs", ".js"];
export async function resolve(spec, ctx, next) {
  let s = spec;
  if (s.startsWith("@/")) s = new URL(s.slice(2), ROOT).href;
  if (s.startsWith(".") || s.startsWith("file:")) {
    const base = s.startsWith("file:") ? s : new URL(s, ctx.parentURL).href;
    if (base.endsWith(".json")) {
      const r = await next(base, ctx);
      return { ...r, importAttributes: { type: "json" } };
    }
    if (!/\\.(ts|tsx|mjs|js|yaml)$/.test(base))
      for (const e of EXT) if (existsSync(new URL(base + e))) return next(base + e, ctx);
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

export function registerAppResolver() {
  register(`data:text/javascript,${encodeURIComponent(hooks)}`);
}
