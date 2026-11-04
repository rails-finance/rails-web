"use client";

// A wallet's CoW trades: the account card (C1), then the trades, newest first,
// narrowed by the shared AssetChooser. The chosen tokens and the pair switch
// live in the URL (?token=0x…,0x…&pair=1); a change replaces the URL and reads
// the first page again through the trades proxy, and "Show more" reads the
// next page below the last row.

import { useCallback, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { BlockRef } from "@/components/shared/block-ref";
import { SpineTipContext } from "@/components/shared/spine-column";
import { EventDateContext } from "@/components/shared/event-time";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import { AssetChooser, type AssetChooserOption } from "@/components/shared/asset-chooser";
import { CowAccountCard } from "@/components/protocol/cow/cow-account-card";
import { CowTradeCard } from "@/components/protocol/cow/cow-trade-card";
import { formatDate } from "@/lib/date";
import { COW_CHAIN_ID, type CowTokenLabel } from "@/lib/cow/trade";
import { assetHref } from "@/lib/shared/asset-roster";
import type { CowTrade, CowTradesPage, CowWalletTokens } from "@/lib/cow/types";
import { SECTION_HEADING, CARD_INSET_START } from "@/lib/shared/ui-grammar";

const PAGE = 50;
const CHOOSER_GROUPS = {
  known: {
    heading: "On Rails",
    info: "Tokens Rails reads across DeFi. Each has an asset page listing the protocols that use it.",
  },
  other: {
    heading: "Other tokens",
    info: "Tokens named only by this wallet's CoW trades. Rails has no asset page for them.",
  },
};
const n = (v: number) => v.toLocaleString("en-US");

/** The date once a day: a row names it where the row above is another UTC day. */
const utcDay = (ts: number) => Math.floor(ts / 86_400);
const datePrefix = (ts: number, aboveTs: number | null): string | null =>
  aboveTs != null && utcDay(aboveTs) === utcDay(ts) ? null : `${shortDate(ts)} ${shortDateYear(ts)}`;

function queryString(tokens: string[], pair: boolean, before?: string): string {
  const p = new URLSearchParams();
  if (tokens.length) p.set("token", tokens.join(","));
  if (pair && tokens.length === 2) p.set("pair", "1");
  if (before) p.set("before", before);
  // Keep the commas readable in the address bar.
  return p.toString().replace(/%2C/g, ",");
}

export function CowWalletView({
  wallet,
  tokens,
  initial,
  initialQuery,
  readFailed,
}: {
  wallet: string;
  tokens: CowWalletTokens | null;
  initial: CowTradesPage | null;
  initialQuery: { tokens: string[]; pair: boolean };
  readFailed: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [selected, setSelected] = useState<string[]>(initialQuery.tokens);
  const [pair, setPair] = useState(initialQuery.pair);
  const [trades, setTrades] = useState<CowTrade[]>(initial?.trades ?? []);
  const [next, setNext] = useState<string | null>(initial?.next ?? null);
  const [matched, setMatched] = useState<number | null>(initial?.matched ?? null);
  const [labels, setLabels] = useState(initial?.tokens ?? {});
  const [loading, setLoading] = useState<"filter" | "more" | null>(null);
  const [failed, setFailed] = useState(false);
  const reqId = useRef(0);
  // The trade rows' receipts scope; each card holds its own inside it.
  const registry = useReceiptRegistry();

  const options: AssetChooserOption[] = useMemo(
    () =>
      (tokens?.tokens ?? []).map((t) => ({
        address: t.address,
        symbol: t.symbol,
        count: t.trades,
        known: t.assetPage,
        last: t.lastBlock,
        href: t.assetPage ? assetHref(COW_CHAIN_ID, t.address) : undefined,
        hrefText: t.protocols.length
          ? `in ${t.protocols.length} ${t.protocols.length === 1 ? "protocol" : "protocols"}`
          : undefined,
        hrefLabel: t.assetPage
          ? `${t.symbol ?? t.address} asset page${t.protocols.length ? `: read in ${t.protocols.join(", ")}` : ""}`
          : undefined,
      })),
    [tokens],
  );
  const labelOf = useCallback(
    (address: string): CowTokenLabel => {
      const t = tokens?.tokens.find((x) => x.address === address);
      const l = labels[address];
      return { address, symbol: t?.symbol ?? l?.symbol ?? null, decimals: t?.decimals ?? l?.decimals ?? null };
    },
    [tokens, labels],
  );

  const read = useCallback(
    async (nextTokens: string[], nextPair: boolean, before?: string) => {
      const id = ++reqId.current;
      setLoading(before ? "more" : "filter");
      setFailed(false);
      try {
        const qs = queryString(nextTokens, nextPair, before);
        const res = await fetch(`/api/cow/ethereum/wallet/${wallet}/trades?${qs}${qs ? "&" : ""}limit=${PAGE}`);
        const body = (await res.json()) as CowTradesPage & { success: boolean };
        if (id !== reqId.current) return;
        if (!res.ok || !body.success) throw new Error(String(res.status));
        setTrades((prev) => (before ? [...prev, ...body.trades] : body.trades));
        setNext(body.next);
        if (!before) setMatched(body.matched);
        setLabels((prev) => ({ ...prev, ...body.tokens }));
      } catch {
        if (id === reqId.current) setFailed(true);
      } finally {
        if (id === reqId.current) setLoading(null);
      }
    },
    [wallet],
  );

  const apply = (nextTokens: string[], nextPair: boolean) => {
    const p = nextPair && nextTokens.length === 2;
    setSelected(nextTokens);
    setPair(p);
    const qs = queryString(nextTokens, p);
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    void read(nextTokens, p);
  };

  const summary = tokens?.summary ?? null;
  const asOf = tokens?.asOf ?? initial?.asOf ?? null;
  const total = summary?.trades ?? null;
  const filtered = selected.length > 0;
  const countLine =
    matched == null || total == null
      ? null
      : filtered
        ? `${n(matched)} of ${n(total)} trades`
        : `${n(total)} ${total === 1 ? "trade" : "trades"}`;

  const explanation =
    summary && summary.trades > 0 && summary.firstTimestamp != null ? (
      <div className="space-y-2 text-sm leading-relaxed">
        <p>
          This wallet has settled {n(summary.trades)} {summary.trades === 1 ? "trade" : "trades"} through CoW Protocol
          on Ethereum since {formatDate(summary.firstTimestamp)}, in {n(tokens?.tokens.length ?? 0)} tokens. Each is a
          Trade log of the settlement contract naming this wallet as the order&rsquo;s owner.
        </p>
        <p>
          ETH sold through CoW&rsquo;s EthFlow contract is recorded under that contract, so those sales are not counted
          here.
        </p>
      </div>
    ) : null;

  return (
    <div className="space-y-6 py-8">
      <DetailTopRow session="cow" wallet={wallet} owner={{ wallet }} assets={[]} tools />

      {asOf && (
        <p className="text-xs text-rb-500" data-cow-asof={asOf.block}>
          CoW Swap · Ethereum · every figure at <BlockRef block={asOf.block} chainId={COW_CHAIN_ID} />, the newest block
          Rails had read when the page loaded
        </p>
      )}

      {readFailed != null && !tokens && (
        <p className="text-sm text-rb-500" data-cow-read-failed={readFailed}>
          The trades could not be read just now. Reload the page to try again.
        </p>
      )}

      {tokens && summary && asOf && (
        <CowAccountCard summary={summary} tokenCount={tokens.tokens.length} asOf={asOf} explanation={explanation} />
      )}

      {tokens && summary && summary.trades === 0 && (
        <p className="text-sm text-rb-500">No CoW trade names this wallet as the order&rsquo;s owner.</p>
      )}

      {tokens && summary && summary.trades > 0 && (
        <section className="space-y-4" data-anatomy="P3" aria-label="Trades">
          <div className={`flex flex-wrap items-baseline justify-between gap-2 ${CARD_INSET_START}`}>
            <h2 className={SECTION_HEADING}>Trades</h2>
            {countLine && (
              <span className="text-xs tabular-nums text-rb-500" aria-live="polite" data-cow-count="">
                {loading === "filter" ? "Reading…" : countLine}
              </span>
            )}
          </div>
          <div className={CARD_INSET_START}>
            <AssetChooser
              options={options}
              selected={selected}
              onChange={(t) => apply(t, pair)}
              pair={pair}
              onPairChange={(p) => apply(selected, p)}
              label="Tokens"
              countNoun="trades"
              sheetStatus={countLine}
              groups={CHOOSER_GROUPS}
              anatomy="L1.11"
            />
          </div>
          {/* The rows' receipts; the toolbar's counts carry none until the
                chooser's receipts land with the stored order reads. */}
          <ProvReceiptsScope registry={registry}>
            <div
              className={loading === "filter" ? "opacity-60 transition-opacity" : "transition-opacity"}
              data-cow-trades=""
            >
              {trades.map((t, i) => (
                <EventDateContext.Provider
                  key={t.id}
                  value={datePrefix(t.timestamp, i > 0 ? trades[i - 1].timestamp : null)}
                >
                  <SpineTipContext.Provider value={i === 0 && !filtered ? "above" : null}>
                    <div id={`event-${t.id}`} data-event-id={t.id} data-row-at={t.timestamp}>
                      <CowTradeCard
                        trade={t}
                        sell={labelOf(t.sellToken)}
                        buy={labelOf(t.buyToken)}
                        isLast={i === trades.length - 1 && !next}
                      />
                    </div>
                  </SpineTipContext.Provider>
                </EventDateContext.Provider>
              ))}
              {trades.length === 0 && loading == null && !failed && (
                <p className="py-6 text-sm text-rb-500">No trade of this wallet matches the chosen tokens.</p>
              )}
            </div>
          </ProvReceiptsScope>
          {failed && <p className="text-sm text-rb-500">The trades could not be read just now.</p>}
          {next && (
            <div className={CARD_INSET_START}>
              <button
                type="button"
                onClick={() => void read(selected, pair, next)}
                disabled={loading != null}
                className="inline-flex h-8 items-center rounded-full border border-teal-500/60 px-3 text-xs font-semibold text-teal-600 transition-colors hover:bg-teal-500/10 disabled:opacity-50 dark:text-teal-400"
                data-cow-more=""
              >
                {loading === "more" ? "Reading…" : `Show ${PAGE} more`}
              </button>
            </div>
          )}
        </section>
      )}
      <ProvInspectorLayer />
    </div>
  );
}
