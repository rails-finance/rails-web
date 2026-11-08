// A resolve hook for the `.ts` verifiers run under tsx: `server-only`
// (lib/api/reader-ip.ts and the Arbitrum page-data modules) throws when it is
// imported outside Next's React server environment, where Next maps it to an
// empty module. This maps it the same way.
//
//   tsx --import ./scripts/verify/lib/server-only-hook.mjs --test scripts/verify/<file>.ts
//
// run-all.mjs passes it for every `.ts` verifier except one that mocks a module
// (`mock.module` does not tolerate it; those mock `server-only` themselves).
//
// tsx loads a module that is not ESM through `require`, which the resolve hook
// does not see (lib/sources/chain/rpc.ts and lib/api/fetch-with-auth.ts are
// server-only since ui-jobs 519), so `server-only` is also put in the require
// cache as an empty module.
import { createRequire, register } from "node:module";

const require = createRequire(import.meta.url);
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
