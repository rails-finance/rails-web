#!/usr/bin/env node
// Share and share-image routes — abuse prevention.
// ---------------------------------------------------------------------------
// Fifty-nine image routes render on demand from a free parameter: the two
// wallet share routes (`/api/share/{polaris,liquity-v2}-wallet?q=`) and the
// 57 file-convention `opengraph-image.tsx` routes (54 at the sweep; the
// Polaris event route joined 2026-09-17, the two vault EVENT routes
// 2026-09-20, and the two vault position routes moved under their explorers'
// own segments — `/ethereum/aave/vaults`, `/base/morpho/vaults`). The count
// is no longer written down: check 0b reads it off the filesystem and holds
// the census to it. A repeated URL is answered
// from the edge for five minutes; a DISTINCT URL is a cache miss, and a bot
// enumerating addresses mints distinct URLs at will. Each miss used to cost a
// backend query (the two wallet routes hopped back through this deployment's
// own proxies, so the box budgeted them as the deployment, never as the bot),
// a Sepolia multicall with nothing in front of it (the Polaris board), and a
// PNG render. This asserts the shape that removed those costs:
//
//   A  THE MEMO — `loadPolarisMarketsFromChain` reads once per minute per
//      instance: a second call inside the TTL adds ZERO HTTP requests; one
//      past it reads again; two concurrent calls on a cold slot share ONE
//      in-flight read; a read that failed is not memoised — the next call
//      reads again. Every count is RELATIVE (viem's batching decides the
//      absolute).
//   B  THE DIRECT READ, AS THE SCRAPER — a share-route request carrying
//      `x-forwarded-for: 203.0.113.9` for a wallet that draws a card makes
//      every backend request straight to RAILS_API_URL, none to its own
//      origin, each with `Authorization: Bearer …` and
//      `X-Rails-Reader-IP: 203.0.113.9` — so the box's per-reader budget is
//      keyed on the scraper, and the deployment's egress bucket is untouched.
//   C  THE GATE — a malformed parameter costs ZERO outbound requests and
//      answers the explorer's static roster card at 200, byte for byte. Five
//      `q` values on both wallet routes (a well-formed name nobody holds is
//      allowed the resolver's own RPC and nothing else), then every one of the
//      57 `opengraph-image.tsx` default exports with a malformed parameter.
//      The CENSUS table below names each route's gate; the loop is the check.
//      A route module that cannot be loaded is a FAILURE by name, never a skip.
//      Check 0b holds the census to the filesystem, so a route added, moved or
//      renamed fails here by name rather than dropping out of the count.
//   D  LIVE, after deploy (BASE not localhost): wallet B's card renders from
//      the edge; `q=hello` is the static card; and — behind BURST=1, last of
//      all, because it blocks the runner's own IP on those paths for the rest
//      of the window — 110 distinct `q=hello-<i>` requests inside a minute meet
//      at least one 403 from the Vercel Firewall rule "Share image rate limit"
//      (100 requests / 60 s fixed window per IP, Deny). Without the flag the
//      burst prints SKIPPED, never a vacuous green.
//   F  THE SSR HOP, AS THE READER — a page render whose loader still reads
//      through this deployment's own /api proxy (the protocol tail loaders,
//      the Liquity-fork trove loaders, the listings' ssrInitial) names the
//      reader to that proxy in the signed pair `x-rails-ssr-reader-ip` /
//      `x-rails-ssr-reader-sig`, and the proxy, receiving it from the
//      function's egress address, reads the backend with
//      `X-Rails-Reader-IP` = the reader. A pair with a wrong signature, or an
//      address without one, is ignored: the proxy falls back to the address
//      the request arrived from, so a reader cannot mint budget keys. F6–F8
//      do the same for the two client-refresh vault ROUTES
//      (`app/api/chain/{aave-vaults,morpho-base}/vault`), whose tail read and
//      writes hop to `/api/vaults/positions/tail`: the reader is the route's
//      own request (`routeHop`), and the tail proxy reads and writes the
//      backend as that reader. Their chain loaders are stubbed, so the child
//      makes no chain read.
//   E  is NOT here: rerun verify-holder-share.mjs, verify-holder-strip.mjs and
//      verify-polaris-listing-ratio.mjs after this, and load
//      /sepolia/polaris/markets once.
//
// THE EXPECTED VALUES ARE RESTATED HERE, never imported: the static card's
// file per explorer, the reader IP, the request classes, the census. A and
// B/C run in node children under a loader hook that aliases `@/`, transpiles
// `.ts`/`.tsx` with the repo's own TypeScript, and stubs `next/headers` (its
// `headers()` answers a host of `share-probe.invalid` and an `x-real-ip` of
// 198.51.100.7, the page's reader, so a loader that hops
// through `ssrOrigin()` is SEEN making that hop rather than silently skipping
// it — an empty Headers would make the fork routes' check vacuous) and
// `next/navigation`. Global `fetch` in each child is a recorder: it captures
// the request's class (backend / self / rpc), its auth and reader headers and
// its JSON-RPC methods, and answers a canned body — a valid `aggregate3`
// result of failures for a multicall, an empty listing for the backend. No
// URL, host or env VALUE is ever printed; env is reported as set/unset.
//
// claude-in-chrome cannot reach localhost — this script is the check.
// Run:  BASE=http://localhost:3414 node scripts/verify/verify-share-abuse.mjs
//       BASE=https://rails.finance BURST=1 node scripts/verify/verify-share-abuse.mjs   (after deploy)
//
// ── PROVED IT CAN FAIL, 2026-09-10 ──────────────────────────────────────────
//   1. `BOARD_TTL_MS = 0` in lib/sources/chain/polaris-position.ts → A2 red
//      ("a second call 30 s inside the TTL adds ZERO requests" saw 1 added),
//      A3 red (a different response object) and A6 red (the concurrent pair
//      made 2 eth_calls against 1 for one call — with no TTL the second call
//      misses the slot the first just filled); A1, A4 and A5 stayed green.
//   2. `readerIp` blanked in app/api/share/polaris-wallet/route.tsx
//      (`readerIpFromRequest(req)` → `undefined`) → B1 red: the backend
//      request carried the bearer token and `readers [null]`.
//   3. The trove-id gate removed from the Ebisu trove route → C12 red naming
//      "ebisu trove · bad id": the loader hopped to `/api/ebisu/troves` and
//      `/api/ebisu/sUSDe/hello/timeline` on this deployment's own origin (two
//      `self` requests) before the static card was served. The FIRST attempt
//      at this proof stayed green: the hook mapped `next/headers` to the real
//      module before stubbing it, whose `headers()` throws outside a request,
//      so every loader that hops through `ssrOrigin()` threw before fetching
//      and the id gate was never exercised — the stub check now runs first
//      (see the hook), and the proof went red.
//   All three reverted; the green run is the reverted tree: 22/22.
//
// ── PROVED IT CAN FAIL, 2026-09-21 (the vault rows and 0b) ──────────────────
//   4. A census row pointed back at the retired `base/vaults/[vault]/[holder]`
//      → 0b red naming the file that is gone, and C11 red with the row's
//      ERR_MODULE_NOT_FOUND — the state this tree was actually in before this
//      change, where two rows named paths that no longer existed and the four
//      real vault routes had no row at all.
//   5. Each vault EVENT row handed a WELL-FORMED parameter instead of its
//      malformed one (Ethereum: a holder that is an address; Base: a vault the
//      roster serves) → C12 red naming both rows: past the gate, each route
//      hops to `/api/vaults/positions` and `/api/vaults/positions/tail` on
//      this deployment's own origin (two `self` requests). So the rows exercise
//      a gate that is really there, rather than passing on a route that never
//      fetches.
//   Both reverted; the green run is the reverted tree: 23/23.
//
// ── PROVED IT CAN FAIL, 2026-09-21 (the SSR hop, F) ─────────────────────────
//   6. `ssrHop()` returning `headers: {}` → F1, F2 and F3 red (hop readers
//      null on every self request), and F4/F5 red with no hop to replay.
//   7. `readerIpFromRequest` skipping the signed pair → F4 red alone: the
//      backend saw the egress address 192.0.2.50.
//   8. The signature check removed (any named address believed) → F5 red
//      alone: the moved signature reached the backend as 203.0.113.77.
//   All reverted; the green run is the reverted tree: 28/28.
//
// ── PROVED IT CAN FAIL, 2026-09-21 (the vault routes' hop, F6–F8) ──────────
//   9. The Aave vault route restored to its previous hop (`baseUrl: origin`,
//      no reader) → F6 red (hop readers [null,null,null]) and F8 red on the
//      Aave three (the backend saw the egress address 192.0.2.50).
//  10. Only the Morpho route's continuation write dropped the reader → F7 red
//      naming the third hop (readers […, null]) and F8 red on that write.
//  11. `routeHop` returning `headers: {}` → F6, F7 and F8 red; F1–F5 green.
//   All reverted; the green run is the reverted tree: 31/31.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const LIVE = !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const ROOT = pathToFileURL(REPO + "/").href;

// The children read RAILS_API_URL / API_BEARER_TOKEN / ALCHEMY_URL from the
// repo's own .env.local, as `next dev` does. Values are never printed.
try {
  process.loadEnvFile(path.join(REPO, ".env.local"));
} catch {
  /* no .env.local — the env must already carry the keys */
}

// The two wallets the plan pins as SHAPES: Polaris's holds CDPs in both
// markets; V2's holds troves on the three branches. Nothing about them is
// asserted here beyond "draws a card" (D) and "reads the backend as the
// scraper" (B).
const POLARIS_WALLET = "0xedb7cca3ba468055b0062d2cd033dfe6c6632959";
const V2_WALLET = "0x8b0afadfde6fa271325305ff24a016b4fb6e3846";
const SCRAPER_IP = "203.0.113.9";
// The five inputs that must answer the static card with zero outbound
// requests. The well-formed name is allowed the resolver's RPC, nothing else.
const STATIC_QS = [
  { q: "27", why: "a CDP / trove number" },
  { q: "hello", why: "free text" },
  { q: "", why: "empty" },
  { q: "0x1234", why: "short hex" },
  { q: "nobody-has-this-name-xyz.eth", why: "a well-formed name nobody holds", rpcAllowed: true },
];

// The static roster card per session, restated (positionImage serves
// `public/og/explore-<protocol id>.png`; Liquity V2's id is `liquity`). The
// key `vaults` is not a session: it is the Ethereum vault POSITION route,
// which passes no `session` at all — that surface has no roster card of its
// own, so `staticFallback(undefined)` answers the home card. Its event route
// and both Base vault routes DO name one (`aave-vaults`, `morpho-base`).
const STATIC_FILE = {
  polaris: "explore-polaris.png",
  "liquity-v2": "explore-liquity.png",
  ebisu: "explore-ebisu.png",
  asymmetry: "explore-asymmetry.png",
  basedollar: "explore-basedollar.png",
  "aave-v3": "explore-aave-v3.png",
  "aave-v3-base": "explore-aave-v3-base.png",
  "aave-v4": "explore-aave-v4.png",
  "aave-vaults": "explore-aave-vaults.png",
  compound: "explore-compound.png",
  "compound-base": "explore-compound-base.png",
  "compound-v2": "explore-compound-v2.png",
  dolomite: "explore-dolomite.png",
  fluid: "explore-fluid.png",
  frankencoin: "explore-frankencoin.png",
  fx: "explore-fx.png",
  "liquity-v1": "explore-liquity-v1.png",
  llamalend: "explore-llamalend.png",
  makerdao: "explore-makerdao.png",
  maple: "explore-maple.png",
  moonwell: "explore-moonwell.png",
  "moonwell-base": "explore-moonwell-base.png",
  morpho: "explore-morpho.png",
  "morpho-base": "explore-morpho-base.png",
  pwn: "explore-pwn.png",
  seamless: "explore-seamless.png",
  spark: "explore-spark.png",
  vaults: "home.png",
};

// ── THE CENSUS ──────────────────────────────────────────────────────────────
// One row per `opengraph-image.tsx`, plus a second row for each of the eight
// Liquity-fork trove routes and each of the four vault routes so BOTH halves
// of their two-part gate are exercised. `gate` names where the rejection lives
// and what the route accepts; `params` is the malformed input this script
// hands the route's default export. Check 0b holds the file column to the
// filesystem — add a route, and this table fails until it has a row.
const ADDR_OK = "0x1111111111111111111111111111111111111111";
// A vault the Base roster serves (Steakhouse Prime USDC), so the "bad holder"
// row is rejected by the HOLDER test and not by the roster one.
const MORPHO_BASE_VAULT = "0xbeefe94c8ad530842bfe7d8b397938ffc1cb83b2";
const F = (p) => `app/(app)/${p}/opengraph-image.tsx`;
const CENSUS = [
  // wallet-keyed routes: ADDRESS in the route file
  {
    id: "aave-v3 base",
    file: F("base/aave-v3/[wallet]"),
    session: "aave-v3-base",
    gate: "route ADDRESS",
    params: { wallet: "hello" },
  },
  {
    id: "aave-v3 base event",
    file: F("base/aave-v3/[wallet]/event/[eventId]"),
    session: "aave-v3-base",
    gate: "route ADDRESS",
    params: { wallet: "hello", eventId: "e" },
  },
  {
    id: "compound-v3 base",
    file: F("base/compound-v3/[wallet]"),
    session: "compound-base",
    gate: "route ADDRESS",
    params: { wallet: "hello" },
  },
  {
    id: "compound-v3 base event",
    file: F("base/compound-v3/[wallet]/event/[eventId]"),
    session: "compound-base",
    gate: "route ADDRESS",
    params: { wallet: "hello", eventId: "e" },
  },
  {
    id: "moonwell base",
    file: F("base/moonwell/[wallet]"),
    session: "moonwell-base",
    gate: "route ADDRESS",
    params: { wallet: "hello" },
  },
  {
    id: "moonwell base event",
    file: F("base/moonwell/[wallet]/event/[eventId]"),
    session: "moonwell-base",
    gate: "route ADDRESS",
    params: { wallet: "hello", eventId: "e" },
  },
  {
    id: "morpho base wallet",
    file: F("base/morpho/[wallet]"),
    session: "morpho-base",
    gate: "route ADDRESS",
    params: { wallet: "hello" },
  },
  {
    id: "morpho base market",
    file: F("base/morpho/[wallet]/[market]"),
    session: "morpho-base",
    gate: "route ADDRESS + isMorphoBaseMarketSegment",
    params: { wallet: "hello", market: "hello" },
  },
  {
    id: "morpho base market event",
    file: F("base/morpho/[wallet]/[market]/event/[eventId]"),
    session: "morpho-base",
    gate: "route ADDRESS + isMorphoBaseMarketSegment",
    params: { wallet: "hello", market: "hello", eventId: "e" },
  },
  {
    id: "seamless",
    file: F("base/seamless/[wallet]"),
    session: "seamless",
    gate: "route ADDRESS",
    params: { wallet: "hello" },
  },
  {
    id: "seamless event",
    file: F("base/seamless/[wallet]/event/[eventId]"),
    session: "seamless",
    gate: "route ADDRESS",
    params: { wallet: "hello", eventId: "e" },
  },
  {
    id: "aave-v3",
    file: F("ethereum/aave-v3/[wallet]"),
    session: "aave-v3",
    gate: "route ADDRESS",
    params: { wallet: "hello" },
  },
  {
    id: "aave-v3 event",
    file: F("ethereum/aave-v3/[wallet]/event/[eventId]"),
    session: "aave-v3",
    gate: "route ADDRESS",
    params: { wallet: "hello", eventId: "e" },
  },
  {
    id: "aave-v4 spoke",
    file: F("ethereum/aave-v4/spoke/[spoke]/[wallet]"),
    session: "aave-v4",
    gate: "route ADDRESS on the wallet (the spoke segment is deliberately open, as on the page)",
    params: { spoke: "core", wallet: "hello" },
  },
  {
    id: "aave-v4 spoke event",
    file: F("ethereum/aave-v4/spoke/[spoke]/[wallet]/event/[eventId]"),
    session: "aave-v4",
    gate: "route ADDRESS on the wallet",
    params: { spoke: "core", wallet: "hello", eventId: "e" },
  },
  {
    id: "compound-v2",
    file: F("ethereum/compound-v2/[wallet]"),
    session: "compound-v2",
    gate: "route ADDRESS",
    params: { wallet: "hello" },
  },
  {
    id: "compound-v2 event",
    file: F("ethereum/compound-v2/[wallet]/event/[eventId]"),
    session: "compound-v2",
    gate: "route ADDRESS",
    params: { wallet: "hello", eventId: "e" },
  },
  {
    id: "compound-v3",
    file: F("ethereum/compound-v3/[market]/[wallet]"),
    session: "compound",
    gate: "route ADDRESS on the wallet (the market segment is deliberately open, as on the page)",
    params: { market: "usdc", wallet: "hello" },
  },
  {
    id: "compound-v3 event",
    file: F("ethereum/compound-v3/[market]/[wallet]/event/[eventId]"),
    session: "compound",
    gate: "route ADDRESS on the wallet",
    params: { market: "usdc", wallet: "hello", eventId: "e" },
  },
  {
    id: "liquity-v1",
    file: F("ethereum/liquity-v1/[wallet]"),
    session: "liquity-v1",
    gate: "route ADDRESS",
    params: { wallet: "hello" },
  },
  {
    id: "liquity-v1 event",
    file: F("ethereum/liquity-v1/[wallet]/event/[eventId]"),
    session: "liquity-v1",
    gate: "route ADDRESS",
    params: { wallet: "hello", eventId: "e" },
  },
  {
    id: "maple",
    file: F("ethereum/maple/[wallet]"),
    session: "maple",
    gate: "route ADDRESS",
    params: { wallet: "hello" },
  },
  {
    id: "maple event",
    file: F("ethereum/maple/[wallet]/event/[eventId]"),
    session: "maple",
    gate: "route ADDRESS",
    params: { wallet: "hello", eventId: "e" },
  },
  {
    id: "moonwell",
    file: F("ethereum/moonwell/[wallet]"),
    session: "moonwell",
    gate: "route ADDRESS",
    params: { wallet: "hello" },
  },
  {
    id: "moonwell event",
    file: F("ethereum/moonwell/[wallet]/event/[eventId]"),
    session: "moonwell",
    gate: "route ADDRESS",
    params: { wallet: "hello", eventId: "e" },
  },
  { id: "pwn", file: F("ethereum/pwn/[wallet]"), session: "pwn", gate: "route ADDRESS", params: { wallet: "hello" } },
  {
    id: "pwn event",
    file: F("ethereum/pwn/[wallet]/event/[eventId]"),
    session: "pwn",
    gate: "route ADDRESS",
    params: { wallet: "hello", eventId: "e" },
  },
  {
    id: "spark",
    file: F("ethereum/spark/[wallet]"),
    session: "spark",
    gate: "route ADDRESS",
    params: { wallet: "hello" },
  },
  {
    id: "spark event",
    file: F("ethereum/spark/[wallet]/event/[eventId]"),
    session: "spark",
    gate: "route ADDRESS",
    params: { wallet: "hello", eventId: "e" },
  },
  // id-keyed routes: a regex or the catalog's normaliser in the route file
  {
    id: "dolomite",
    file: F("ethereum/dolomite/[owner]/[accountNumber]"),
    session: "dolomite",
    gate: "route ADDRESS + normalizeAccountNumber",
    params: { owner: "hello", accountNumber: "0" },
  },
  {
    id: "dolomite event",
    file: F("ethereum/dolomite/[owner]/[accountNumber]/event/[eventId]"),
    session: "dolomite",
    gate: "route ADDRESS + normalizeAccountNumber",
    params: { owner: "hello", accountNumber: "0", eventId: "e" },
  },
  {
    id: "fluid",
    file: F("ethereum/fluid/[nft]"),
    session: "fluid",
    gate: "route NFT_ID /^\\d{1,20}$/",
    params: { nft: "hello" },
  },
  {
    id: "fluid event",
    file: F("ethereum/fluid/[nft]/event/[eventId]"),
    session: "fluid",
    gate: "route NFT_ID /^\\d{1,20}$/",
    params: { nft: "hello", eventId: "e" },
  },
  {
    id: "frankencoin",
    file: F("ethereum/frankencoin/[position]"),
    session: "frankencoin",
    gate: "route normalizePositionAddress",
    params: { position: "hello" },
  },
  {
    id: "frankencoin event",
    file: F("ethereum/frankencoin/[position]/event/[eventId]"),
    session: "frankencoin",
    gate: "route normalizePositionAddress",
    params: { position: "hello", eventId: "e" },
  },
  {
    id: "fx",
    file: F("ethereum/fx/[position]"),
    session: "fx",
    gate: "route parseFxPositionSlug",
    params: { position: "hello" },
  },
  {
    id: "fx event",
    file: F("ethereum/fx/[position]/event/[eventId]"),
    session: "fx",
    gate: "route parseFxPositionSlug",
    params: { position: "hello", eventId: "e" },
  },
  {
    id: "llamalend",
    file: F("ethereum/llamalend/[controller]/[user]"),
    session: "llamalend",
    gate: "route normalizeAddressParam ×2",
    params: { controller: "hello", user: "hello" },
  },
  {
    id: "llamalend event",
    file: F("ethereum/llamalend/[controller]/[user]/event/[eventId]"),
    session: "llamalend",
    gate: "route normalizeAddressParam ×2",
    params: { controller: "hello", user: "hello", eventId: "e" },
  },
  {
    id: "makerdao",
    file: F("ethereum/makerdao/[vault]"),
    session: "makerdao",
    gate: "route CDP_ID | URN_ADDRESS",
    params: { vault: "hello" },
  },
  {
    id: "makerdao event",
    file: F("ethereum/makerdao/[vault]/event/[eventId]"),
    session: "makerdao",
    gate: "route CDP_ID | URN_ADDRESS",
    params: { vault: "hello", eventId: "e" },
  },
  {
    id: "morpho",
    file: F("ethereum/morpho/[positionId]"),
    session: "morpho",
    gate: "route POSITION_ID",
    params: { positionId: "hello" },
  },
  {
    id: "morpho event",
    file: F("ethereum/morpho/[positionId]/event/[eventId]"),
    session: "morpho",
    gate: "route POSITION_ID",
    params: { positionId: "hello", eventId: "e" },
  },
  {
    id: "polaris cdp",
    file: F("sepolia/polaris/[market]/[id]"),
    session: "polaris",
    gate: "route normalizeMarket + normalizeCdpId",
    params: { market: "usdp", id: "hello" },
  },
  // the Polaris event route (2026-09-17): both halves of the parent's gate
  // run in the route file BEFORE `loadPolarisPositionTail`; the twitter twin
  // shares this default export
  {
    id: "polaris event · bad market",
    file: F("sepolia/polaris/[market]/[id]/event/[eventId]"),
    session: "polaris",
    gate: "route normalizeMarket + normalizeCdpId before loadPolarisPositionTail",
    params: { market: "hello", id: "8", eventId: "e" },
  },
  {
    id: "polaris event · bad id",
    file: F("sepolia/polaris/[market]/[id]/event/[eventId]"),
    session: "polaris",
    gate: "route normalizeMarket + normalizeCdpId before loadPolarisPositionTail",
    params: { market: "usdp", id: "hello", eventId: "e" },
  },
  // the Liquity-fork trove routes: branch roster + TROVE_ID in the route file
  // (added 2026-09-10 — the loaders gated the branch only, and a non-numeric
  // id reached the backend); both halves exercised
  ...[
    ["ebisu", "ethereum/ebisu", "sUSDe", "resolveBranch"],
    ["asymmetry", "ethereum/asymmetry", "ysyBOLD", "resolveBranch"],
    ["basedollar", "base/basedollar", "weth", "resolveBranch"],
    ["liquity-v2", "ethereum/liquity-v2/trove", "WETH", "LIQUITY_V2_BRANCHES"],
  ].flatMap(([session, base, branch, roster]) => [
    {
      id: `${session} trove · bad branch`,
      file: F(`${base}/[collateralType]/[troveId]`),
      session,
      gate: `route ${roster} + TROVE_ID /^\\d+$/`,
      params: { collateralType: "hello", troveId: "1" },
    },
    {
      id: `${session} trove · bad id`,
      file: F(`${base}/[collateralType]/[troveId]`),
      session,
      gate: `route ${roster} + TROVE_ID /^\\d+$/`,
      params: { collateralType: branch, troveId: "hello" },
    },
    {
      id: `${session} event · bad branch`,
      file: F(`${base}/[collateralType]/[troveId]/event/[eventId]`),
      session,
      gate: `route ${roster} + TROVE_ID /^\\d+$/`,
      params: { collateralType: "hello", troveId: "1", eventId: "e" },
    },
    {
      id: `${session} event · bad id`,
      file: F(`${base}/[collateralType]/[troveId]/event/[eventId]`),
      session,
      gate: `route ${roster} + TROVE_ID /^\\d+$/`,
      params: { collateralType: branch, troveId: "hello", eventId: "e" },
    },
  ]),
  // the four vault routes: vault + holder in the route file (added 2026-09-10
  // — the card asked the census proxy with whatever the path said). The two
  // POSITION routes moved under their explorers' segments and the two EVENT
  // routes joined them, so the paths below are `ethereum/aave/vaults` and
  // `base/morpho/vaults`, not the retired `{ethereum,base}/vaults`.
  //
  // Ethereum, position — `load()` line 39 of the route: `!ADDRESS.test(vault)
  // || !ADDRESS.test(decodeURIComponent(holder))` returns null BEFORE
  // `vaultShareCardModel` and before `ssrOrigin()`, so neither the census
  // proxy nor a host lookup is reached. No `session`: the home card.
  {
    id: "vaults ethereum · bad vault",
    file: F("ethereum/aave/vaults/[vault]/[holder]"),
    session: "vaults",
    gate: "route ADDRESS on the vault + ADDRESS on the holder, before vaultShareCardModel",
    params: { vault: "hello", holder: ADDR_OK },
  },
  {
    id: "vaults ethereum · bad holder",
    file: F("ethereum/aave/vaults/[vault]/[holder]"),
    session: "vaults",
    gate: "route ADDRESS on the vault + ADDRESS on the holder, before vaultShareCardModel",
    params: { vault: ADDR_OK, holder: "hello" },
  },
  // Ethereum, event — `load()` line 45: the same two ADDRESS tests, on the
  // lowercased vault and holder, BEFORE `ssrOrigin()`, `vaultUnitsFromCensus`
  // (the census proxy) and `vaultEventCardModel` (the stored tail). Falls back
  // to Aave's vault-layer roster card (rails-ops decision 0028).
  {
    id: "vaults ethereum event · bad vault",
    file: F("ethereum/aave/vaults/[vault]/[holder]/event/[eventId]"),
    session: "aave-vaults",
    gate: "route ADDRESS on the vault + ADDRESS on the holder, before vaultUnitsFromCensus and vaultEventCardModel",
    params: { vault: "hello", holder: ADDR_OK, eventId: "e" },
  },
  {
    id: "vaults ethereum event · bad holder",
    file: F("ethereum/aave/vaults/[vault]/[holder]/event/[eventId]"),
    session: "aave-vaults",
    gate: "route ADDRESS on the vault + ADDRESS on the holder, before vaultUnitsFromCensus and vaultEventCardModel",
    params: { vault: ADDR_OK, holder: "hello", eventId: "e" },
  },
  // Base, position — `load()` line 41: the vault is gated on the SERVED
  // ROSTER (`isMorphoBaseServedVault`, catalog membership, which an address
  // that is merely well-shaped fails), the holder on ADDRESS; both before
  // `vaultShareCardModel` and `ssrOrigin()`. A MetaMorpho vault is Morpho Blue
  // Base's, so the fallback is that explorer's card, not the home card.
  {
    id: "vaults base · bad vault",
    file: F("base/morpho/vaults/[vault]/[holder]"),
    session: "morpho-base",
    gate: "route isMorphoBaseServedVault + ADDRESS on the holder, before vaultShareCardModel",
    params: { vault: "hello", holder: ADDR_OK },
  },
  {
    id: "vaults base · bad holder",
    file: F("base/morpho/vaults/[vault]/[holder]"),
    session: "morpho-base",
    gate: "route isMorphoBaseServedVault + ADDRESS on the holder, before vaultShareCardModel",
    params: { vault: MORPHO_BASE_VAULT, holder: "hello" },
  },
  // Base, event — `load()` line 48: the same roster test and the same holder
  // ADDRESS test, BEFORE `morphoBaseVaultByAddress`, `ssrOrigin()`,
  // `vaultUnitsFromCensus` and the stored tail.
  {
    id: "vaults base event · bad vault",
    file: F("base/morpho/vaults/[vault]/[holder]/event/[eventId]"),
    session: "morpho-base",
    gate: "route isMorphoBaseServedVault + ADDRESS on the holder, before vaultUnitsFromCensus and vaultEventCardModel",
    params: { vault: "hello", holder: ADDR_OK, eventId: "e" },
  },
  {
    id: "vaults base event · bad holder",
    file: F("base/morpho/vaults/[vault]/[holder]/event/[eventId]"),
    session: "morpho-base",
    gate: "route isMorphoBaseServedVault + ADDRESS on the holder, before vaultUnitsFromCensus and vaultEventCardModel",
    params: { vault: MORPHO_BASE_VAULT, holder: "hello", eventId: "e" },
  },
];

let failures = 0;
let checked = 0;
const check = (name, cond, detail = "") => {
  checked++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
  return cond;
};
const info = (name, detail) => console.log(`INFO  ${name} — ${detail}`);
const skipped = (name, why) => console.log(`SKIPPED  ${name} — ${why}`);
const setOrUnset = (k) => (process.env[k] ? "set" : "unset");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

info(
  "env",
  `RAILS_API_URL ${setOrUnset("RAILS_API_URL")}; API_BEARER_TOKEN ${setOrUnset("API_BEARER_TOKEN")}; ALCHEMY_URL ${setOrUnset("ALCHEMY_URL")}; ENS_RPC_URL ${setOrUnset("ENS_RPC_URL")}`,
);

const staticSha = {};
for (const [session, file] of Object.entries(STATIC_FILE)) {
  const p = path.join(REPO, "public", "og", file);
  staticSha[session] = existsSync(p) ? sha256(readFileSync(p)) : null;
}
check(
  "0. every restated static card exists on disk",
  Object.values(staticSha).every(Boolean),
  Object.entries(staticSha)
    .filter(([, v]) => !v)
    .map(([k]) => k)
    .join(", "),
);

// The census is hand-written, so the filesystem is what holds it honest: a
// route ADDED, MOVED or RENAMED must fail here by name rather than quietly
// leaving the count behind (2026-09-20: the two vault position routes had
// moved under `/ethereum/aave` and `/base/morpho` and their event twins were
// new, and the census still named the retired paths).
const APP_DIR = path.join(REPO, "app", "(app)");
const walkOg = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walkOg(path.join(dir, e.name))
      : e.name === "opengraph-image.tsx"
        ? [path.relative(REPO, path.join(dir, e.name))]
        : [],
  );
const onDisk = walkOg(APP_DIR).sort();
const distinctFiles = new Set(CENSUS.map((r) => r.file));
const uncovered = onDisk.filter((f) => !distinctFiles.has(f));
const gone = [...distinctFiles].filter((f) => !onDisk.includes(f)).sort();
check(
  `0b. the census IS the filesystem: a row for every opengraph-image.tsx under app/(app), and no row for a file that is gone (${onDisk.length} routes, ${CENSUS.length} rows)`,
  uncovered.length === 0 && gone.length === 0,
  [
    uncovered.length ? `uncovered: ${uncovered.join(", ")}` : "",
    gone.length ? `the census names a file that is gone: ${gone.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("; ") || `${distinctFiles.size} distinct files`,
);

// Each route's twitter twin re-exports the og route's default export, so the
// census covers both halves of the surface — but only while the twin is there
// and still points at it.
const TWIN_IMPORT = /from\s+"\.\/opengraph-image"/;
const badTwins = onDisk.filter((f) => {
  const twin = path.join(REPO, path.dirname(f), "twitter-image.tsx");
  return !existsSync(twin) || !TWIN_IMPORT.test(readFileSync(twin, "utf8"));
});
check(
  "0c. every image route's twitter twin sits beside it and renders the SAME default export — so one census row covers both",
  badTwins.length === 0,
  badTwins.join(", ") || `${onDisk.length} twins`,
);

// ── the loader hook (shared by every child) ─────────────────────────────────
const HOOK = String.raw`
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
const ROOT = process.env.PROBE_ROOT;
const require = createRequire(ROOT + "package.json");
const ts = require("typescript");
const STUBS = {
  "next/headers": 'export async function headers(){ return new Headers({ host: "share-probe.invalid", "x-forwarded-proto": "http", "x-real-ip": "198.51.100.7" }); } export async function cookies(){ return { get(){ return undefined; } }; }',
  "next/navigation": 'export function notFound(){ throw new Error("notFound"); }',
  // A child may stub more modules by specifier (runChild's third argument).
  ...JSON.parse(process.env.PROBE_STUBS || "{}"),
};
export async function resolve(spec, ctx, next) {
  // The stubs come FIRST: node_modules/next/headers.js exists, and mapping it
  // to disk before stubbing it once loaded the real module, whose headers()
  // throws outside a request — every loader that hops through ssrOrigin()
  // threw before fetching, and the fork routes' id gate passed vacuously.
  if (spec in STUBS) return { url: "stub:" + spec, shortCircuit: true };
  if (/^next\/[a-z-]+$/.test(spec)) {
    const p = fileURLToPath(ROOT) + "node_modules/" + spec + ".js";
    if (existsSync(p)) return next(pathToFileURL(p).href, ctx);
  }
  let url = null;
  if (spec.startsWith("@/")) url = ROOT + spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) url = new URL(spec, ctx.parentURL).href;
  if (url) {
    if (!/\.[a-z]+$/.test(url) || !existsSync(fileURLToPath(url))) {
      for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
        if (existsSync(fileURLToPath(url + ext))) { url += ext; break; }
      }
    }
    return next(url, ctx);
  }
  return next(spec, ctx);
}
export async function load(url, ctx, next) {
  if (url.startsWith("stub:")) return { format: "module", source: STUBS[url.slice(5)], shortCircuit: true };
  if (/\.tsx?$/.test(url) && url.startsWith("file:")) {
    const src = readFileSync(fileURLToPath(url), "utf8");
    const out = ts.transpileModule(src, {
      fileName: fileURLToPath(url),
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    });
    return { format: "module", source: out.outputText, shortCircuit: true };
  }
  return next(url, ctx);
}
`;

// The recorder every child installs as global fetch. Records the class of
// each request and the headers that matter; answers canned bodies; never
// leaks a URL to the parent.
const RECORDER = String.raw`
import { register } from "node:module";
import { decodeFunctionData, encodeFunctionResult, multicall3Abi } from "viem";
register("data:text/javascript," + encodeURIComponent(process.env.PROBE_HOOK));
const ROOT = process.env.PROBE_ROOT;
const SELF = "http://share-probe.invalid";
const BACKEND = process.env.RAILS_API_URL || null;
const rec = { calls: [], fail: false, reset() { this.calls = []; } };
const cls = (u) => (BACKEND && u.startsWith(BACKEND) ? "backend" : u.startsWith("/") || u.startsWith(SELF) ? "self" : "rpc");
const rpcAnswer = (r) => {
  const id = r.id ?? 1;
  if (r.method === "eth_chainId") return { jsonrpc: "2.0", id, result: "0xaa36a7" };
  if (r.method === "eth_blockNumber") return { jsonrpc: "2.0", id, result: "0x1234" };
  if (r.method === "eth_call") {
    try {
      const { functionName, args } = decodeFunctionData({ abi: multicall3Abi, data: r.params?.[0]?.data ?? "0x" });
      if (functionName === "aggregate3") {
        const result = args[0].map(() => ({ success: false, returnData: "0x" }));
        return { jsonrpc: "2.0", id, result: encodeFunctionResult({ abi: multicall3Abi, functionName: "aggregate3", result }) };
      }
    } catch {}
    return { jsonrpc: "2.0", id, result: "0x" };
  }
  return { jsonrpc: "2.0", id, error: { code: -32601, message: "recorder: no such method" } };
};
const json = (v) => new Response(JSON.stringify(v), { status: 200, headers: { "content-type": "application/json" } });
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : {}));
  let bodyText = "";
  if (init?.body != null) bodyText = typeof init.body === "string" ? init.body : "";
  else if (input instanceof Request) bodyText = await input.clone().text().catch(() => "");
  let body = null;
  try { body = JSON.parse(bodyText); } catch {}
  const reqs = Array.isArray(body) ? body : body && body.method ? [body] : [];
  const kind = cls(url);
  const auth = headers.get("authorization");
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  rec.calls.push({
    kind,
    method,
    put: kind === "self" && method === "PUT" ? bodyText : undefined,
    query: kind === "self" ? new URL(url, SELF).search : undefined,
    methods: reqs.map((r) => r.method),
    bearer: Boolean(auth && auth.startsWith("Bearer ")),
    reader: headers.get("x-rails-reader-ip"),
    hopIp: headers.get("x-rails-ssr-reader-ip"),
    hopSig: headers.get("x-rails-ssr-reader-sig"),
    path: kind === "backend" ? new URL(url).pathname : kind === "self" ? new URL(url, SELF).pathname : null,
  });
  if (rec.fail) throw new Error("recorder: refused");
  if (kind === "rpc") {
    const out = reqs.map(rpcAnswer);
    return json(Array.isArray(body) ? out : (out[0] ?? {}));
  }
  const p = new URL(url, SELF).pathname;
  if (p.endsWith("/api/polaris/positions")) return json({ rows: [], total: 0, limit: 20, offset: 0, markets: [] });
  if (p.endsWith("/api/troves")) return json({ success: true, data: [], pagination: { total: 0, page: 1, limit: 20 } });
  if (p.endsWith("/api/oracle/liquity-v2")) return json({ success: true, data: null });
  return json({ success: true, data: [], pagination: { total: 0, limit: 20, offset: 0 }, markets: [], census: [] });
};
const snapshot = () => rec.calls.map((c) => ({ ...c }));
const count = (kind) => rec.calls.filter((c) => c.kind === kind).length;
const ethCalls = () => rec.calls.reduce((n, c) => n + c.methods.filter((m) => m === "eth_call").length, 0);
`;

function runChild(label, body, stubs = {}) {
  const probe = spawnSync(process.execPath, ["--no-warnings", "--input-type=module", "--eval", RECORDER + body], {
    cwd: REPO,
    encoding: "utf8",
    timeout: 240000,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PROBE_ROOT: ROOT, PROBE_HOOK: HOOK, PROBE_STUBS: JSON.stringify(stubs) },
  });
  const line = /RESULT (\{.*\})/.exec(probe.stdout ?? "");
  if (!line) {
    check(`${label}. the probe runs`, false, (probe.stderr ?? "").trim().slice(-900));
    return null;
  }
  return JSON.parse(line[1]);
}

// ── A · the memo ────────────────────────────────────────────────────────────
const a = runChild(
  "A0",
  String.raw`
const { loadPolarisMarketsFromChain: load } = await import(ROOT + "lib/sources/chain/polaris-position.ts");
const out = {};
rec.reset(); const r1 = await load(0);       out.n1 = rec.calls.length; out.eth1 = ethCalls(); out.stale1 = r1.chainStale; out.block1 = r1.blockNumber;
rec.reset(); const r2 = await load(30_000);  out.n2 = rec.calls.length; out.same12 = r1 === r2; out.block2 = r2.blockNumber;
rec.reset(); const r3 = await load(61_000);  out.eth3 = ethCalls(); out.same13 = r1 === r3;
// viem serves getBlockNumber from its own 4-second cache, and multicall with
// allowFailure turns a refused aggregate3 into per-call failures rather than
// a throw — so a refusal inside that window would read as a live board of
// zeros. Wait it out, so the refusal is a real failure of the read.
await new Promise((r) => setTimeout(r, 4_500));
rec.reset(); rec.fail = true; const r4 = await load(200_000); out.stale4 = r4.chainStale; rec.fail = false;
rec.reset(); const r5 = await load(200_001); out.eth5 = ethCalls(); out.stale5 = r5.chainStale;
rec.reset(); const [c1, c2] = await Promise.all([load(400_000), load(400_000)]); out.eth6 = ethCalls(); out.same6 = c1 === c2;
console.log("RESULT " + JSON.stringify(out));
`,
);
if (a) {
  check(
    "A1. a cold call reads the board: ≥1 RPC request, answered live (not chainStale)",
    a.n1 >= 1 && a.stale1 === false,
    `${a.n1} request(s), ${a.eth1} eth_call(s), chainStale=${a.stale1}`,
  );
  check("A2. a second call 30 s inside the TTL adds ZERO requests", a.n2 === 0, `${a.n2} added`);
  check(
    "A3. …and answers the SAME response — the block it read at, not re-stamped",
    a.same12 === true && a.block1 === a.block2,
    `same=${a.same12}, block ${a.block1} vs ${a.block2}`,
  );
  check(
    "A4. a call 61 s later reads again (≥1 eth_call, a new response)",
    a.eth3 >= 1 && a.same13 === false,
    `${a.eth3} eth_call(s), same=${a.same13}`,
  );
  check(
    "A5. a read that failed is not memoised — it answered the stub, and the next call reads again",
    a.stale4 === true && a.eth5 >= 1 && a.stale5 === false,
    `stale after refusal=${a.stale4}; next call ${a.eth5} eth_call(s), chainStale=${a.stale5}`,
  );
  check(
    "A6. two concurrent calls on a cold slot share ONE in-flight read",
    a.eth6 === a.eth1 && a.same6 === true,
    `${a.eth6} eth_call(s) for the pair vs ${a.eth1} for one; same=${a.same6}`,
  );
}

// ── B + C · the direct read as the scraper, and the gate ────────────────────
const bc = runChild(
  "B0",
  String.raw`
import { createHash } from "node:crypto";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const CENSUS = ${JSON.stringify(CENSUS)};
const STATIC_QS = ${JSON.stringify(STATIC_QS)};
const out = { share: {}, og: [] };
const polaris = await import(ROOT + "app/api/share/polaris-wallet/route.tsx");
const v2 = await import(ROOT + "app/api/share/liquity-v2-wallet/route.tsx");
async function hit(mod, q) {
  rec.reset();
  const res = await mod.GET(new Request(SELF + "/api/share/x?q=" + encodeURIComponent(q), { headers: { "x-forwarded-for": ${JSON.stringify(SCRAPER_IP)} } }));
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, type: res.headers.get("content-type"), sha: sha(buf), len: buf.length, calls: snapshot() };
}
out.share.polarisB = await hit(polaris, ${JSON.stringify(POLARIS_WALLET)});
out.share.v2B = await hit(v2, ${JSON.stringify(V2_WALLET)});
for (const { q } of STATIC_QS) {
  out.share["p:" + q] = await hit(polaris, q);
  out.share["v:" + q] = await hit(v2, q);
}
for (const row of CENSUS) {
  try {
    const mod = await import(ROOT + row.file);
    rec.reset();
    const res = await mod.default({ params: Promise.resolve(row.params) });
    const buf = Buffer.from(await res.arrayBuffer());
    out.og.push({ id: row.id, status: res.status, sha: sha(buf), len: buf.length, calls: snapshot() });
  } catch (e) {
    out.og.push({ id: row.id, error: String(e && e.stack ? e.stack : e).split("\n").slice(0, 3).join(" | ") });
  }
}
console.log("RESULT " + JSON.stringify(out));
`,
);
if (bc) {
  const kinds = (calls) => ({
    backend: calls.filter((c) => c.kind === "backend"),
    self: calls.filter((c) => c.kind === "self"),
    rpc: calls.filter((c) => c.kind === "rpc"),
  });
  const describe = (calls) => {
    const k = kinds(calls);
    return `backend ${k.backend.length} (${k.backend.map((c) => c.path).join(", ") || "—"}), self ${k.self.length} (${k.self.map((c) => c.path).join(", ") || "—"}), rpc ${k.rpc.length}`;
  };
  const asScraper = (calls) => calls.every((c) => c.bearer && c.reader === SCRAPER_IP);

  // B
  const pb = kinds(bc.share.polarisB.calls);
  check(
    "B1. Polaris wallet route: the backend read goes straight to RAILS_API_URL, as the scraper — bearer token + X-Rails-Reader-IP, none to its own origin",
    pb.backend.length >= 1 &&
      pb.self.length === 0 &&
      asScraper(pb.backend) &&
      pb.backend.every((c) => c.path.endsWith("/api/polaris/positions")),
    `${describe(bc.share.polarisB.calls)}; readers ${JSON.stringify(pb.backend.map((c) => c.reader))}; bearer ${JSON.stringify(pb.backend.map((c) => c.bearer))}`,
  );
  const vb = kinds(bc.share.v2B.calls);
  check(
    "B2. Liquity V2 wallet route: troves + oracle both straight to RAILS_API_URL as the scraper, none to its own origin",
    vb.backend.length === 2 &&
      vb.self.length === 0 &&
      asScraper(vb.backend) &&
      vb.backend.some((c) => c.path.endsWith("/api/troves")) &&
      vb.backend.some((c) => c.path.endsWith("/api/oracle/liquity-v2")),
    `${describe(bc.share.v2B.calls)}; readers ${JSON.stringify(vb.backend.map((c) => c.reader))}; bearer ${JSON.stringify(vb.backend.map((c) => c.bearer))}`,
  );

  // C — the wallet routes
  let n = 1;
  for (const { q, why, rpcAllowed } of STATIC_QS) {
    for (const [label, key, session] of [
      ["Polaris", "p:" + q, "polaris"],
      ["Liquity V2", "v:" + q, "liquity-v2"],
    ]) {
      const r = bc.share[key];
      const k = kinds(r.calls);
      const zero = k.backend.length === 0 && k.self.length === 0 && (rpcAllowed || k.rpc.length === 0);
      check(
        `C${n}. ${label} wallet route, q="${q}" (${why}): 200, the static card byte for byte, ${rpcAllowed ? "no backend or self request (the resolver's RPC allowed)" : "ZERO outbound requests"}`,
        r.status === 200 && r.sha === staticSha[session] && zero,
        `${r.status} ${r.type} ${r.len} B, static=${r.sha === staticSha[session]}; ${describe(r.calls)}`,
      );
      n++;
    }
  }

  // C — the census
  const loadErrors = bc.og.filter((r) => r.error);
  check(
    `C${n}. every census route module loads under the hook (a module that cannot load is named here, never dropped)`,
    loadErrors.length === 0,
    loadErrors.map((r) => `${r.id}: ${r.error}`).join(" ‖ ") || `${bc.og.length} rows`,
  );
  n++;
  const bad = [];
  for (const row of CENSUS) {
    const r = bc.og.find((x) => x.id === row.id);
    if (!r || r.error) continue;
    const k = kinds(r.calls);
    const ok = r.status === 200 && r.sha === staticSha[row.session] && r.calls.length === 0;
    if (!ok)
      bad.push(
        `${row.id} [${row.gate}] → ${r.status}, static=${r.sha === staticSha[row.session]}, ${describe(r.calls)} (${k.rpc.length} rpc)`,
      );
  }
  check(
    `C${n}. every census row answers 200, the static card byte for byte, with ZERO outbound requests (${bc.og.length} rows)`,
    bad.length === 0 && bc.og.length === CENSUS.length,
    bad.join(" ‖ ") || `${bc.og.length - loadErrors.length} rows green`,
  );
}

// ── F · the SSR hop carries the reader ──────────────────────────────────────
const SSR_READER = "198.51.100.7"; // the stubbed page request's x-real-ip
const EGRESS_IP = "192.0.2.50"; // the function's own address, as the hop arrives
const f = runChild(
  "F0",
  String.raw`
const SSR_READER = ${JSON.stringify(SSR_READER)};
const EGRESS_IP = ${JSON.stringify(EGRESS_IP)};
const WALLET = "0x1111111111111111111111111111111111111111";
const out = {};
const { loadAaveV3PositionTail } = await import(ROOT + "lib/aave-v3/position-page-data.ts");
const { loadEbisuTroveTail } = await import(ROOT + "lib/ebisu/trove-page-data.ts");
const { ssrInitial } = await import(ROOT + "lib/shared/listing-ssr.ts");
const { fetchAaveV3Positions } = await import(ROOT + "lib/api/fetch-aave-v3-positions.ts");
const { aaveV3ListDimensions, AAVE_V3_LIST_DEFAULTS } = await import(ROOT + "lib/aave-v3/list-filter-dimensions.tsx");
const route = await import(ROOT + "app/api/aave-v3/positions/route.ts");
const { NextRequest } = await import("next/server");

// The canned bodies are not real rows, so a loader may throw once it reads
// them; the requests it made are recorded by then, and they are the check.
rec.reset(); await loadAaveV3PositionTail(WALLET, "core", false).catch(() => null); out.tail = snapshot();
rec.reset(); await loadEbisuTroveTail("sUSDe", "1").catch(() => null); out.fork = snapshot();
rec.reset();
await ssrInitial({
  dims: aaveV3ListDimensions(),
  defaults: AAVE_V3_LIST_DEFAULTS,
  filters: AAVE_V3_LIST_DEFAULTS,
  page: 1,
  label: "probe",
  fetchPage: (baseUrl, signal, headers) =>
    fetchAaveV3Positions({ limit: 20, baseUrl, signal, headers }).then((r) => ({ data: r.rows ?? [], total: r.total ?? 0 })),
});
out.listing = snapshot();

// The hop as the proxy receives it: Vercel has stamped x-real-ip with the
// function's egress address; the signed pair is whatever the render sent.
const sent = out.tail.find((c) => c.kind === "self" && c.hopIp && c.hopSig);
async function proxied(pair) {
  rec.reset();
  const h = new Headers({ "x-real-ip": EGRESS_IP, ...pair });
  await route.GET(new NextRequest("http://share-probe.invalid/api/aave-v3/positions?limit=1", { headers: h })).catch(() => null);
  return snapshot().filter((c) => c.kind === "backend");
}
if (sent) {
  out.good = await proxied({ "x-rails-ssr-reader-ip": sent.hopIp, "x-rails-ssr-reader-sig": sent.hopSig });
  out.otherIp = await proxied({ "x-rails-ssr-reader-ip": "203.0.113.77", "x-rails-ssr-reader-sig": sent.hopSig });
  out.badSig = await proxied({ "x-rails-ssr-reader-ip": sent.hopIp, "x-rails-ssr-reader-sig": "0".repeat(sent.hopSig.length) });
  out.noSig = await proxied({ "x-rails-ssr-reader-ip": "203.0.113.77" });
}
console.log("RESULT " + JSON.stringify(out));
`,
);
if (f) {
  const selfCalls = (calls) => calls.filter((c) => c.kind === "self");
  const hopDetail = (calls) =>
    `${selfCalls(calls).length} self (${
      selfCalls(calls)
        .map((c) => c.path)
        .join(", ") || "—"
    }); hop readers ${JSON.stringify(selfCalls(calls).map((c) => c.hopIp))}; signed ${JSON.stringify(selfCalls(calls).map((c) => Boolean(c.hopSig)))}`;
  const carries = (calls) =>
    selfCalls(calls).length >= 1 && selfCalls(calls).every((c) => c.hopIp === SSR_READER && Boolean(c.hopSig));
  check(
    "F1. a protocol tail loader (Aave V3) names the page's reader, signed, on every request to its own /api proxy",
    carries(f.tail),
    hopDetail(f.tail),
  );
  check(
    "F2. a Liquity-fork trove loader (Ebisu) keeps its hop — the proxy values rows at the branch PriceFeed — and names the reader on it",
    carries(f.fork) && f.fork.every((c) => c.kind === "self"),
    hopDetail(f.fork),
  );
  check("F3. a listing's ssrInitial hands fetchPage the signed reader", carries(f.listing), hopDetail(f.listing));
  const readers = (calls) => JSON.stringify((calls ?? []).map((c) => [c.bearer, c.reader]));
  check(
    "F4. the proxy, receiving that hop from the egress address, reads the backend with the bearer token and X-Rails-Reader-IP = the page's reader",
    (f.good ?? []).length >= 1 && f.good.every((c) => c.bearer && c.reader === SSR_READER),
    `[bearer, reader] ${readers(f.good)}`,
  );
  check(
    "F5. a signature moved onto another address, a zeroed signature, and an address with none are all ignored — the backend sees the egress address",
    [f.otherIp, f.badSig, f.noSig].every(
      (calls) => (calls ?? []).length >= 1 && calls.every((c) => c.reader === EGRESS_IP),
    ),
    `other ip ${readers(f.otherIp)}; zeroed sig ${readers(f.badSig)}; no sig ${readers(f.noSig)}`,
  );
}

// ── F6–F8 · the vault routes' hop to the tail store carries the reader ──────
// The two client-refresh vault routes are route handlers, so the reader is the
// request they were called with — not `next/headers`, whose stub names
// SSR_READER. The request here names VAULT_READER, so a route that took the
// reader from anywhere but its request fails by showing the wrong address.
// The chain loaders are stubbed (a canned served vault, and a timeline that
// hands back a tail to store and a build continuation that stores one more
// chunk), so the route reaches its tail read and both writes with no chain
// read at all; `after()` is stubbed to queue its callback, which the child
// then runs. What is under test is the route's plumbing, not the loaders.
const VAULT_READER = "198.51.100.23"; // the browser calling the vault route
const probeTail = (chainId, loaderVersion) =>
  `{ chainId: ${chainId}, vault: vault.toLowerCase(), holder: holder.toLowerCase(), loaderVersion: ${loaderVersion}, cut: 90, cutBalance: "0", logsIn: 1, logsOut: 0, lane: "PROBE_LANE", storedAt: "2026-09-21T00:00:00.000Z", rows: [{ blockNumber: 50, logIndex: 0, timestamp: 1700000000, sharesDelta: "0", sharePriceAtBlock: "1000000" }] }`;
const timelineStub = (name, chainId, loaderVersion) =>
  `export async function ${name}(vault, holder) { const tail = ${probeTail(chainId, loaderVersion)}; return { timeline: null, store: tail, continueBuild: async (put) => { await put({ ...tail, cut: 95 }); } }; }`;
const VAULT_STUBS = {
  "next/server": `export * from ${JSON.stringify(ROOT + "node_modules/next/server.js")}; export function after(fn) { (globalThis.__probeAfter ??= []).push(fn); }`,
  "@/lib/sources/chain/aave-ethereum-vault":
    'export async function loadAaveEthereumVault(vault, holder) { return { served: true, chainStale: false, blockNumber: 100, holder: holder ? { address: holder.toLowerCase() } : null, vault: { address: vault.toLowerCase(), family: "probe", shareDecimals: 18, asset: { decimals: 6 } } }; }',
  "@/lib/sources/chain/aave-ethereum-vault-timeline": timelineStub("loadAaveEthereumVaultTimelineWithTail", 1, 3),
  "@/lib/sources/chain/morpho-base-vault":
    "export async function loadMorphoBaseVault(vault, holder) { return { chainStale: false, blockNumber: 100, holder: holder ? { address: holder.toLowerCase() } : null, vault: { address: vault.toLowerCase(), createdBlock: 1, decimals: 18, asset: { decimals: 6 } } }; }",
  "@/lib/sources/chain/morpho-base-vault-timeline": timelineStub("loadMorphoBaseVaultTimelineWithTail", 8453, 2),
};
const v = runChild(
  "F6",
  String.raw`
const VAULT_READER = ${JSON.stringify(VAULT_READER)};
const EGRESS_IP = ${JSON.stringify(EGRESS_IP)};
const HOLDER = "0x2222222222222222222222222222222222222222";
const out = {};
const { NextRequest } = await import("next/server");
const { MORPHO_BASE_CASE_STUDY_VAULT } = await import(ROOT + "lib/morpho-base/vault-case-study.ts");
const aave = await import(ROOT + "app/api/chain/aave-vaults/vault/route.ts");
const morpho = await import(ROOT + "app/api/chain/morpho-base/vault/route.ts");
const tailProxy = await import(ROOT + "app/api/vaults/positions/tail/route.ts");
async function drive(mod, vault) {
  rec.reset();
  globalThis.__probeAfter = [];
  const req = new NextRequest(SELF + "/api/chain/probe/vault?vault=" + vault + "&holder=" + HOLDER, { headers: { "x-real-ip": VAULT_READER } });
  const res = await mod.GET(req);
  for (const fn of globalThis.__probeAfter) await fn();
  return { status: res.status, queued: globalThis.__probeAfter.length, calls: snapshot() };
}
out.aave = await drive(aave, "0x3333333333333333333333333333333333333333");
out.morpho = await drive(morpho, MORPHO_BASE_CASE_STUDY_VAULT);

// Each recorded hop as the tail proxy receives it: from the egress address,
// carrying whatever pair the route sent (none, if it sent none).
async function replay(c) {
  rec.reset();
  const h = new Headers({ "x-real-ip": EGRESS_IP });
  if (c.hopIp) h.set("x-rails-ssr-reader-ip", c.hopIp);
  if (c.hopSig) h.set("x-rails-ssr-reader-sig", c.hopSig);
  const init = { method: c.method, headers: h };
  if (c.method === "PUT") { h.set("content-type", "application/json"); init.body = c.put; }
  const handler = c.method === "PUT" ? tailProxy.PUT : tailProxy.GET;
  const res = await handler(new NextRequest(SELF + c.path + c.query, init)).catch(() => null);
  return { method: c.method, status: res ? res.status : null, backend: snapshot().filter((x) => x.kind === "backend") };
}
out.replays = [];
for (const c of [...out.aave.calls, ...out.morpho.calls].filter((x) => x.kind === "self")) out.replays.push(await replay(c));
console.log("RESULT " + JSON.stringify(out));
`,
  VAULT_STUBS,
);
if (v) {
  const TAIL = "/api/vaults/positions/tail";
  const tailHops = (calls) => (calls ?? []).filter((c) => c.kind === "self");
  const vaultDetail = (r) =>
    `${r.status}; ${
      tailHops(r.calls)
        .map((c) => `${c.method} ${c.path}`)
        .join(", ") || "no self request"
    }; hop readers ${JSON.stringify(tailHops(r.calls).map((c) => c.hopIp))}; signed ${JSON.stringify(tailHops(r.calls).map((c) => Boolean(c.hopSig)))}`;
  // One tail read and two writes (the first chunk, then the continuation's).
  const vaultCarries = (r) => {
    const hops = tailHops(r.calls);
    return (
      r.status === 200 &&
      hops.filter((c) => c.method === "GET").length === 1 &&
      hops.filter((c) => c.method === "PUT").length === 2 &&
      hops.every((c) => c.path === TAIL && c.hopIp === VAULT_READER && Boolean(c.hopSig))
    );
  };
  check(
    "F6. the Aave Ethereum vault route (app/api/chain/aave-vaults/vault) names ITS request's reader, signed, on the tail read and both tail writes",
    vaultCarries(v.aave),
    vaultDetail(v.aave),
  );
  check(
    "F7. the Morpho Base vault route (app/api/chain/morpho-base/vault) names ITS request's reader, signed, on the tail read and both tail writes",
    vaultCarries(v.morpho),
    vaultDetail(v.morpho),
  );
  check(
    "F8. the tail proxy, receiving those six hops from the egress address, reads and writes the backend with the bearer token and X-Rails-Reader-IP = the vault route's reader",
    v.replays.length === 6 &&
      v.replays.every(
        (r) =>
          r.status === 200 && r.backend.length === 1 && r.backend.every((c) => c.bearer && c.reader === VAULT_READER),
      ),
    v.replays
      .map((r) => `${r.method} ${r.status} ${JSON.stringify(r.backend.map((c) => [c.bearer, c.reader]))}`)
      .join("; ") || "no hop to replay",
  );
}

// ── D · live, after deploy ──────────────────────────────────────────────────
if (!LIVE) {
  skipped("D1–D3. live checks", `BASE is ${BASE}; run with BASE=https://rails.finance after deploy`);
} else {
  const get = async (p) => {
    const res = await fetch(`${BASE}${p}`, { headers: { "user-agent": "rails-verify" } });
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      status: res.status,
      type: res.headers.get("content-type"),
      edge: res.headers.get("x-vercel-cache"),
      sha: sha256(buf),
      len: buf.length,
    };
  };
  const live = await get(`/api/share/polaris-wallet?q=${POLARIS_WALLET}`);
  check(
    "D1. live: wallet B's Polaris card renders from the edge — 200 image/png, bytes ≠ the static card, x-vercel-cache present",
    live.status === 200 && /image\/png/.test(live.type ?? "") && live.sha !== staticSha.polaris && Boolean(live.edge),
    `${live.status} ${live.type} ${live.len} B, x-vercel-cache=${live.edge}`,
  );
  const hello = await get(`/api/share/polaris-wallet?q=hello`);
  check(
    "D2. live: q=hello is the static card byte for byte",
    hello.status === 200 && hello.sha === staticSha.polaris,
    `${hello.status} ${hello.len} B`,
  );

  if (process.env.BURST !== "1") {
    skipped(
      "D3. the burst (110 distinct share URLs in one minute → ≥1 403 from the Firewall rule)",
      "BURST=1 not set; it blocks the runner's IP on those paths for the rest of the window, so it is opt-in and runs LAST",
    );
  } else {
    const statuses = [];
    const bodies = [];
    const t0 = Date.now();
    for (let i = 0; i < 110; i += 10) {
      const batch = await Promise.all(
        Array.from({ length: 10 }, (_, j) =>
          get(`/api/share/polaris-wallet?q=hello-${i + j}`).catch((e) => ({ status: -1, err: String(e) })),
        ),
      );
      for (const b of batch) {
        statuses.push(b.status);
        if (b.status === 200) bodies.push(b.sha === staticSha.polaris);
      }
    }
    const elapsed = Date.now() - t0;
    const n403 = statuses.filter((s) => s === 403).length;
    const n200 = statuses.filter((s) => s === 200).length;
    check(
      "D3. live burst: 110 distinct q=hello-<i> inside one minute → at least one 403 (Deny) from the edge, and every 200 was the static card",
      elapsed < 60_000 && n403 >= 1 && n200 >= 1 && bodies.every(Boolean),
      `${n200} × 200, ${n403} × 403, other ${statuses.filter((s) => s !== 200 && s !== 403).length}, in ${(elapsed / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })} s`,
    );
  }
}

console.log(`\n${checked - failures}/${checked} passed${failures ? ` — ${failures} FAILED` : ""}`);
process.exit(failures ? 1 : 0);
