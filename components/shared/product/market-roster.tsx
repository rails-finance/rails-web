"use client";

// A market roster (archetype A1, rails-ops ui-jobs 549; anatomy M4): the
// page header, then one panel per market stacked, each the market's head
// (`ProductHeadSection`: its heading row with the read stamp and ⋮, the vitals
// band ending in its links, the (i)) and no reserves table. Each panel reads
// its own market through the family's `useMarket`, in parallel, and draws its
// own loading and failure states.

import { MarketBody, type ProductPageHeader } from "@/components/shared/product/market-page";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import type { Loadable, MarketModel } from "@/lib/shared/product/model";
import { ScopeNote, useScopedRows } from "@/components/shared/asset-scope-note";

/** One market's panel. `useMarket` is the family's read, called once per panel. */
function Panel<K extends string>({
  k,
  name,
  useMarket,
}: {
  k: K;
  name: string;
  useMarket: (k: K) => Loadable<MarketModel>;
}) {
  const market = useMarket(k);
  return (
    <section aria-label={name} data-overview-market={k}>
      <MarketBody market={market} what={name} headOnly />
    </section>
  );
}

export function MarketRoster<K extends string>({
  header,
  markets,
  useMarket,
  anatomy = "M4",
  keysOf,
  keysPending = false,
}: {
  header: ProductPageHeader;
  /** Each market's key and name, in the roster's order. */
  markets: readonly { key: K; name: string }[];
  useMarket: (k: K) => Loadable<MarketModel>;
  anatomy?: string;
  /** Focus (ui-jobs 557): a market's `chain:address` keys, where the family
   *  names them; the roster then keeps the markets in focus. */
  keysOf?: (k: K) => string[];
  /** The keys are still being read: the roster stays held and says nothing
   *  until they are in. */
  keysPending?: boolean;
}) {
  const scoped = useScopedRows(
    [...markets],
    (m) => keysOf?.(m.key) ?? [],
    () => header.protocol.chainId,
  );
  const shown = keysOf ? scoped.rows : markets;
  return (
    <div className="min-h-screen" data-anatomy={`${anatomy} R1`}>
      <div className="py-8">
        <SubPageHeader protocol={header.protocol} title={header.title} learnMore={header.learnMore} />
        {keysOf && !keysPending && <ScopeNote scoped={scoped} noun={["market", "markets"]} className="mb-3" />}
        <div className="space-y-2" {...(keysPending && scoped.on ? { "data-scope-list": "" } : scoped.listProps)}>
          {shown.map((m) => (
            <Panel key={m.key} k={m.key} name={m.name} useMarket={useMarket} />
          ))}
        </div>
      </div>
    </div>
  );
}
