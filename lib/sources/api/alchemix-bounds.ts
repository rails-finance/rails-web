// The Size and Transactions bounds an Alchemix listing carries on its query string.
// Pure helpers, shared by the server readers and the browser fetchers.

/** The Size and Transactions bounds an Alchemix listing may carry. */
export type AlchemixBoundKey = "minDebtUsd" | "maxDebtUsd" | "minCollUsd" | "maxCollUsd" | "minTx" | "maxTx";

/** The named bounds from the proxy's query string, each only as a whole
 *  number; anything else is dropped. */
export function parseWholeBounds(
  sp: URLSearchParams,
  keys: readonly AlchemixBoundKey[],
): Partial<Record<AlchemixBoundKey, number>> {
  const out: Partial<Record<AlchemixBoundKey, number>> = {};
  for (const k of keys) {
    const v = sp.get(k);
    if (v != null && /^\d+$/.test(v)) out[k] = Number(v);
  }
  return out;
}

/** Write the named bounds that are set onto the backend's query string. */
export function setBounds(
  qs: URLSearchParams,
  p: Partial<Record<AlchemixBoundKey, number>>,
  keys: readonly AlchemixBoundKey[],
): void {
  for (const k of keys) {
    const v = p[k];
    if (v != null) qs.set(k, String(v));
  }
}
