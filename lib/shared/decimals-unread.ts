// Tokens whose `decimals` did not load, carried on the timeline's events.
// ----------------------------------------------------------------------------
// When the RPC does not answer, the ERC-20 resolvers (lib/sources/chain/
// erc20-meta.ts, aave-v3-tokens.ts) fall back to 18 decimals and mark the token
// `unresolved`. A timeline builder records every such token on the event it
// touches (`BaseActivityEvent.decimalsUnread`) and on the flow it moved
// (`AssetFlow.decimalsUnread`). Everything downstream reads the flag through
// this module:
//
//   - a row states "Not loaded" with the token in place of the amount;
//   - a total (Lifetime flows, economics, USD) leaves the token out and says so;
//   - an export writes "not loaded" in the cell;
//   - a timeline route answers `no-store` (timelineCacheHeaders), so the next
//     request reads the token again.
//
// Client-safe: no server imports.

import type { BaseActivityEvent, UnreadToken } from "@/lib/shared/types/event-shape";

/** The UnreadToken list for a set of resolved metas: every one whose decimals
 *  did not load (no meta at all, or `unresolved`). Keyed by address. */
export function unreadTokensOf(
  entries: Iterable<{ address: string; meta: { symbol: string; unresolved?: true } | null | undefined }>,
): UnreadToken[] {
  const out = new Map<string, UnreadToken>();
  for (const { address, meta } of entries) {
    if (!address) continue;
    const a = address.toLowerCase();
    if (meta != null && !meta.unresolved) continue;
    if (!out.has(a)) out.set(a, { address: a, label: meta?.symbol ?? `${a.slice(0, 6)}…${a.slice(-4)}` });
  }
  return [...out.values()];
}

/** Spread into an event: `{ decimalsUnread }` when the list has any, else `{}`. */
export function decimalsUnreadField(tokens: UnreadToken[]): { decimalsUnread?: UnreadToken[] } {
  return tokens.length > 0 ? { decimalsUnread: tokens } : {};
}

/** The unread token an event names by `key` — its address, or the symbol the
 *  context carries for it. Undefined when that token loaded. */
export function unreadToken(
  e: Pick<BaseActivityEvent, "decimalsUnread">,
  key: string | null | undefined,
): UnreadToken | undefined {
  if (!key || !e.decimalsUnread?.length) return undefined;
  if (/^0x[0-9a-fA-F]{40}$/.test(key)) return e.decimalsUnread.find((t) => t.address === key.toLowerCase());
  return e.decimalsUnread.find((t) => t.label === key);
}

/** Whether any of these events names a token whose decimals did not load. */
export function timelineHasUnread(events: readonly Pick<BaseActivityEvent, "decimalsUnread">[]): boolean {
  return events.some((e) => (e.decimalsUnread?.length ?? 0) > 0);
}

/** Every unread token across these events, once each. */
export function unreadTokensIn(events: readonly Pick<BaseActivityEvent, "decimalsUnread">[]): UnreadToken[] {
  const out = new Map<string, UnreadToken>();
  for (const e of events) for (const t of e.decimalsUnread ?? []) if (!out.has(t.address)) out.set(t.address, t);
  return [...out.values()];
}

/** The hover line where a total leaves tokens out. */
export function leftOutTitle(tokens: readonly UnreadToken[]): string {
  const names = tokens.map((t) => t.address).join(", ");
  return tokens.length === 1
    ? `This total leaves out ${names}: the chain didn't answer for its decimals. It is added once it does.`
    : `This total leaves out ${names}: the chain didn't answer for their decimals. They are added once it does.`;
}

/** The hover line where figures wait on tokens' decimals. */
export function decimalsTitle(tokens: readonly UnreadToken[]): string {
  return `The chain didn't answer for the decimals of ${tokens.map((t) => t.address).join(", ")}. The figures show once it does.`;
}

/** The words that stand in for an amount in an export cell. */
export const NOT_LOADED_CELL = "not loaded";

/** Cache-Control for a timeline response: `no-store` when any event names an
 *  unread token (or `alsoUnread` says the response does elsewhere), so neither the edge nor a browser keeps a response the next
 *  read would correct; otherwise `cacheable` unchanged. */
export function timelineCacheHeaders(
  events: readonly Pick<BaseActivityEvent, "decimalsUnread">[],
  cacheable: Record<string, string>,
  /** Set when the response names an unread token outside its drawn events (a
   *  swept lane's lifetime sums or end state). */
  alsoUnread = false,
): Record<string, string> {
  return alsoUnread || timelineHasUnread(events) ? { "Cache-Control": "no-store" } : cacheable;
}
