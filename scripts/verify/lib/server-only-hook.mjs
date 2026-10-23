// A resolve hook for the `.ts` verifiers run under tsx: `server-only`
// (lib/api/reader-ip.ts and the Arbitrum page-data modules) throws when it is
// imported outside Next's React server environment, where Next maps it to an
// empty module. This maps it the same way.
//
//   tsx --import ./scripts/verify/lib/server-only-hook.mjs --test scripts/verify/<file>.ts
//
// run-all.mjs passes it for every `.ts` verifier except one that mocks a module
// (`mock.module` does not tolerate it; those mock `server-only` themselves).
import { register } from "node:module";

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
