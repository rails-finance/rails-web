import type { NextConfig } from "next";

/** Old explorer path → new chain-scoped path, for the redirects below. Written
 *  out rather than imported: next.config.ts is loaded outside the app's module
 *  graph, so the `@/` alias is not available here and it cannot read the roster
 *  directly. `check-explorer-routes.mjs` asserts this table against
 *  `lib/shared/protocols.ts`, so a drift fails a gate rather than a visitor. */
const LEGACY_EXPLORER_PATHS: [string, string][] = [
  ["/aave-v3", "/ethereum/aave-v3"],
  ["/aave-v3-base", "/base/aave-v3"],
  ["/aave-v4", "/ethereum/aave-v4"],
  // Aave's vault layer never had a pre-0016 path; the row exists because
  // check:routes wants every explorer forwarded from its bare slug. It cannot
  // be a bare `/aave` — that is the guess a reader looking for the POOL makes,
  // and sending them to the vault layer would answer a different question.
  ["/aave-vaults", "/ethereum/aave"],
  ["/asymmetry", "/ethereum/asymmetry"],
  ["/basedollar", "/base/basedollar"],
  ["/compound", "/ethereum/compound-v3"],
  ["/compound-base", "/base/compound-v3"],
  ["/compound-v2", "/ethereum/compound-v2"],
  ["/dolomite", "/ethereum/dolomite"],
  ["/ebisu", "/ethereum/ebisu"],
  ["/fluid", "/ethereum/fluid"],
  ["/frankencoin", "/ethereum/frankencoin"],
  ["/fx", "/ethereum/fx"],
  ["/liquity-v1", "/ethereum/liquity-v1"],
  ["/liquity-v2", "/ethereum/liquity-v2"],
  ["/llamalend", "/ethereum/llamalend"],
  ["/makerdao", "/ethereum/makerdao"],
  ["/maple", "/ethereum/maple"],
  ["/moonwell", "/ethereum/moonwell"],
  ["/moonwell-base", "/base/moonwell"],
  ["/morpho", "/ethereum/morpho"],
  ["/morpho-base", "/base/morpho"],
  // Polaris never had a pre-0016 path; the row exists because check:routes
  // wants every explorer forwarded from its bare slug, and a bare /polaris is
  // the address anyone will guess.
  ["/polaris", "/sepolia/polaris"],
  ["/pwn", "/ethereum/pwn"],
  ["/seamless", "/base/seamless"],
  ["/spark", "/ethereum/spark"],
  // Yearn never had a pre-0016 path either; the row exists for the same reason
  // Polaris's does, and a bare /yearn is unambiguous — one Yearn door, and V3
  // is the only version covered.
  ["/yearn", "/ethereum/yearn"],
];

const nextConfig: NextConfig = {
  // Next 15.5.7 dev: webpack reports framer-motion's server vendor chunk as
  // compiled but never writes `.next/server/vendor-chunks/framer-motion@….js`,
  // so any route that SSRs a framer-motion component 500s with
  // "Cannot find module './vendor-chunks/framer-motion…'". Transpiling it bundles
  // framer-motion into each route's own chunks instead of the vendor-chunk split,
  // sidestepping the unwritten-chunk bug. (Drop once on a Next that emits it.)
  transpilePackages: ["framer-motion"],
  async redirects() {
    return [
      // Legacy explorer paths — collapsed to a single hop to the new canonical
      // /liquity-v2/trove/... rather than chaining through the intermediate
      // /trove/... URL.
      {
        source: "/explorer/trove/:troveId/:branch(ETH)",
        destination: "/ethereum/liquity-v2/trove/WETH/:troveId",
        permanent: true,
      },
      {
        source: "/explorer/trove/:troveId/:branch",
        destination: "/ethereum/liquity-v2/trove/:branch/:troveId",
        permanent: true,
      },
      {
        source: "/explorer",
        destination: "/",
        permanent: true,
      },
      // Mono-rails move: /trove/[c]/[id] now lives under /liquity-v2/trove/...
      {
        source: "/trove/:collateralType/:troveId",
        destination: "/ethereum/liquity-v2/trove/:collateralType/:troveId",
        permanent: true,
      },
      // Wallet view is the filtered listing, not a dedicated route. Anyone
      // landing on /liquity-v2/[wallet] (legacy bookmarks, the wallet pill
      // before this change) gets sent to /liquity-v2?q=… — the listing's
      // single search param (`q`), read centrally by the shared driver; both
      // `parseTroveSearch` and `parseAaveV4Search` discriminate address vs
      // `.eth` from that one param, so the ENS form collapses onto `q` too.
      // We match two shapes — 0x address or .eth ENS — so the trove subtree
      // (/liquity-v2/trove/...) and other future children aren't caught by the
      // redirect. Anything else 404s, which is fine: only addresses and ENS
      // names ever lived at this depth.
      {
        source: "/liquity-v2/:slug(0x[0-9a-fA-F]{40})",
        destination: "/ethereum/liquity-v2?q=:slug",
        permanent: true,
      },
      {
        source: "/liquity-v2/:slug([^/]+\\.eth)",
        destination: "/ethereum/liquity-v2?q=:slug",
        permanent: true,
      },
      // Aave V4: same pattern, same single `q` param. The
      // /aave-v4/spoke/[spoke]/[wallet] detail tree is deeper (three extra
      // segments) so it doesn't collide with these single-segment matchers.
      {
        source: "/aave-v4/:slug(0x[0-9a-fA-F]{40})",
        destination: "/ethereum/aave-v4?q=:slug",
        permanent: true,
      },
      {
        source: "/aave-v4/:slug([^/]+\\.eth)",
        destination: "/ethereum/aave-v4?q=:slug",
        permanent: true,
      },
      // rails.finance had per-hub pages (/aave-v4/hubs/core, …/core/bluechip);
      // this project has only the hubs index, so both the old and the
      // chain-prefixed shape land there — one hop, ahead of the prefix table.
      {
        source: "/aave-v4/hubs/:path+",
        destination: "/ethereum/aave-v4/hubs",
        permanent: true,
      },
      {
        source: "/ethereum/aave-v4/hubs/:path+",
        destination: "/ethereum/aave-v4/hubs",
        permanent: true,
      },
      // Compound V3 moved from a single per-wallet page (/compound/[wallet],
      // which stacked all of a wallet's markets) to per-(market, wallet) pages
      // (/compound/[market]/[wallet]) — the Aave V4 spoke model. The wallet view
      // is now the filtered listing, so a bare /compound/0xADDR bookmark goes to
      // /compound?q=ADDR (q is the listing's search param — see decodeListFilters).
      // The two-segment detail tree (/compound/<market>/<wallet>) is deeper, so
      // it doesn't collide; the static /compound/markets wins over the [market]
      // dynamic segment; anything else at this single-segment depth 404s (only
      // addresses ever lived here — Comet has no ENS owner view).
      {
        source: "/compound/:slug(0x[0-9a-fA-F]{40})",
        destination: "/ethereum/compound-v3?q=:slug",
        permanent: true,
      },
      // "How It Works" merged into About, and About in turn merged into the
      // home page ("What Rails Does" panel; the Technical Architecture tab
      // became /about/architecture, which stays). Preserve inbound bookmarks
      // for both retired pages by sending them home.
      {
        source: "/how-it-works",
        destination: "/",
        permanent: true,
      },
      {
        source: "/about",
        destination: "/",
        permanent: true,
      },
      // The cross-protocol /wallet/[address] umbrella is gone — each rail
      // stands alone. Preserve inbound bookmarks by sending stale links to
      // the platform home, which surfaces the protocol cards.
      {
        source: "/wallet/:slug*",
        destination: "/",
        permanent: true,
      },
      // ── The chain moved into the path (rails-ops decision 0016) ──
      // Every explorer used to sit at `/<id>`; it now sits at `/<chain>/<slug>`.
      // preview.rails.finance is a demo, so breaking its URLs was accepted —
      // but published share cards, the blog and the ops docs all still link the
      // old shapes, and the table below is derived from the same roster the app
      // routes off, so it costs a table rather than a decision per link.
      //
      // These come LAST. Next takes the first matching rule, so the specific
      // legacy rules above (a bare `/compound/0xADDR` → the filtered listing)
      // still win over the catch-all for the same prefix.
      //
      // A rule matches by SEGMENT, so `/compound/:path*` cannot catch
      // `/compound-v2/...` or `/compound-base/...`; each old id is its own first
      // segment and forwards on its own.
      ...LEGACY_EXPLORER_PATHS.flatMap(([from, to]) => [
        { source: from, destination: to, permanent: true },
        { source: `${from}/:path*`, destination: `${to}/:path*`, permanent: true },
      ]),
      // Aave V4 spoke URLs moved from `/aave-v4/spoke/Display%20Name/[wallet]`
      // to a kebab-case slug. The legacy → slug 308 is handled in
      // `middleware.ts` rather than here because Next's `redirects` matcher is
      // case-insensitive — a `source: "/aave-v4/spoke/Main/:wallet"` rule
      // would also catch the canonical lowercase `main` and self-loop. The
      // middleware does explicit case-sensitive slug detection.
    ];
  },
};

export default nextConfig;
