// The protocol context of an asset link (lib/shared/asset-via.ts) as the
// roster names it: the explorer a path sits in, the `via` it carries, and the
// back link's words for the path it came from.

import {
  POSITION_NOUN,
  PROTOCOLS,
  protocolForPathname,
  subPageForPathname,
  type ProtocolEntry,
} from "@/lib/shared/protocols";
import { parseVia, safeFrom, type ViaExplorer } from "@/lib/shared/asset-via";

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

/** The explorer a page's path sits in, with the market its `?market=` names
 *  (an Aave V3 position: `core`, `prime`); null off the explorers. */
export function viaForPathname(pathname: string | null, search?: string | null): ViaExplorer | null {
  const p = protocolForPathname(pathname);
  if (!p) return null;
  const market = search ? new URLSearchParams(search).get("market") : null;
  return viaOf(p, market && /^[\w-]{1,40}$/.test(market) ? market : null);
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
