// The protocol context of an asset link (lib/shared/asset-via.ts) as the
// roster names it: the explorer a path sits in, the `via` it carries, and the
// back link's words for the path it came from. The market is the series key's
// second part: an Aave V3 position's `?market=` (`aave-v3:core`), a Compound V3
// position's Comet from its path (`compound:0xc3d6…`, the path's market key
// mapped to its Comet), a Liquity V2 or fork trove's branch from its path
// (`liquity:wstETH`).

import {
  POSITION_NOUN,
  PROTOCOLS,
  protocolForPathname,
  subPageForPathname,
  type ProtocolEntry,
} from "@/lib/shared/protocols";
import { parseVia, safeFrom, type ViaExplorer } from "@/lib/shared/asset-via";
import { COMPOUND_DEPLOYMENT } from "@/lib/compound/asset-catalog";
import { COMPOUND_BASE_DEPLOYMENT } from "@/lib/compound-base/asset-catalog";

/** Each Comet explorer's market keys (`usdc`) to their Comets. */
const COMETS: Record<string, Map<string, string>> = {
  compound: new Map(COMPOUND_DEPLOYMENT.markets.map((m) => [m.key, m.comet.toLowerCase()])),
  "compound-base": new Map(COMPOUND_BASE_DEPLOYMENT.markets.map((m) => [m.key, m.comet.toLowerCase()])),
};
/** The trove explorers: a trove's path is `<branch>/<trove id>` under the
 *  explorer (Liquity V2 under `trove/`). */
const TROVE_PATH: Record<string, number> = { liquity: 1, asymmetry: 0, ebisu: 0, basedollar: 0 };

/** The market a position's path names, as the roster's series key carries it. */
function pathMarket(p: ProtocolEntry, pathname: string): string | null {
  const rest = pathname.slice(p.href.length).split("/").filter(Boolean);
  const comets = COMETS[p.id];
  if (comets) return rest.length >= 2 ? (comets.get(rest[0].toLowerCase()) ?? null) : null;
  const at = TROVE_PATH[p.id];
  if (at == null || rest.length < at + 2 || (at === 1 && rest[0] !== "trove")) return null;
  return decodeURIComponent(rest[at]);
}

const viaOf = (p: ProtocolEntry, market?: string | null): ViaExplorer => ({
  id: p.id,
  label: p.label,
  chain: p.chainId,
  market: market ?? null,
});

/** The explorer a `via` names (`aave-v3`, `aave-v3:core`); null for an id
 *  the roster does not have. */
export function viaExplorer(value: string | null | undefined): ViaExplorer | null {
  const v = parseVia(value);
  const p = v ? PROTOCOLS.find((x) => x.id === v.id) : undefined;
  return p && v ? viaOf(p, v.market) : null;
}

/** The explorer a page's path sits in, with the market its path names (a
 *  Comet, a branch) or else its `?market=` (an Aave V3 position: `core`,
 *  `prime`); null off the explorers. */
export function viaForPathname(pathname: string | null, search?: string | null): ViaExplorer | null {
  const p = protocolForPathname(pathname);
  if (!p || !pathname) return null;
  const market = pathMarket(p, pathname) ?? (search ? new URLSearchParams(search).get("market") : null);
  return viaOf(p, market && /^[\w-]{1,42}$/.test(market) ? market : null);
}

/** The `via` value for an explorer: its id, and its market where it names one. */
export const viaValue = (v: ViaExplorer) => (v.market ? `${v.id}:${v.market}` : v.id);

/** The back link for a `from`: "← Back to the Aave V3 position",
 *  "← Back to the Compound V3 Markets", "← Back to Aave V3",
 *  "← Back to the asset explorer". Null for a `from` off this site. */
export function backLink(from: string | null | undefined): { href: string; label: string } | null {
  const href = safeFrom(from);
  if (!href) return null;
  const path = href.split(/[?#]/)[0];
  if (path === "/assets") return { href, label: "← Back to the asset explorer" };
  const p = protocolForPathname(path);
  if (!p) return { href, label: "← Back" };
  if (path === p.href || path === p.listingHref) return { href, label: `← Back to ${p.label}` };
  const sub = subPageForPathname(p, path);
  if (sub && (path === sub.href || path === `${sub.href}/positions`))
    return { href, label: `← Back to the ${p.label} ${sub.tab.toLowerCase()}` };
  if (/\/event\//.test(path)) return { href, label: `← Back to the ${p.label} event` };
  return { href, label: `← Back to the ${p.label} ${POSITION_NOUN[p.session].toLowerCase()}` };
}
