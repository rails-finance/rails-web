// Which protocol a V3-family Pool belongs to, for the prose.
// ----------------------------------------------------------------------------
// The Aave V3 event cards, their plain-English clauses and their "?" modals are
// reused by every Aave-V3-architecture explorer — Aave V3 on Ethereum, Aave V3
// on Base, Seamless on Base. The receipts already name the right Pool through
// V3PoolIdentity (lib/aave-v3/pool-context.tsx); the PROSE named "Aave V3" as
// a literal, so a Seamless withdraw read "Withdrew 0.096 USDC from Aave V3"
// and its modal explained "Aave V3's Pool". The mechanics are the same — a fork
// is the same machine — but the name is not, and a page that calls the
// protocol by another protocol's name is wrong on its face.
//
// The name rides on the identity (`protocol`), absent meaning Aave V3, so every
// identity written before the field existed reads exactly as it did. The
// helpers here are the only place the spelling variants live: the protocol
// ("Aave V3", "Seamless"), the brand the mechanics prose names ("Aave checks
// credit delegation" — the protocol without its version), and the possessive.

export type V3Protocol = "Aave V3" | "Seamless";

/** The protocol a Pool identity belongs to; Aave V3 when unstated. */
export function v3Protocol(pool: { protocol?: V3Protocol } | undefined): V3Protocol {
  return pool?.protocol ?? "Aave V3";
}

/** The brand without its version — what the mechanics prose names as the
 *  actor ("Aave asks for no permission …"). */
export function v3Brand(protocol: V3Protocol): string {
  return protocol === "Aave V3" ? "Aave" : protocol;
}

/** Possessive with the apostrophe the call site's style uses (’ in JSX prose,
 *  ' in the modal strings). A name ending in s takes the bare apostrophe. */
export function v3Possessive(name: string, apostrophe: "’" | "'" = "’"): string {
  return name.endsWith("s") ? `${name}${apostrophe}` : `${name}${apostrophe}s`;
}

export const SEAMLESS_DOCS_URL = "https://docs.seamlessprotocol.com/";
