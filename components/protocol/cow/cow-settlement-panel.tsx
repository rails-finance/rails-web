"use client";

// The CoW trade card's settlement panel (ui-jobs 711), under the cells of an
// opened card whose settlement carried other trades: the trades on the card's
// directed pair with their prices, the settlement's clearing price and each
// trade's distance from it where settle()'s calldata was decoded, then the
// settlement's other pairs as a count. Read when the card opens
// (`useCowSettlementOpened`), through the settlement proxy.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Prov } from "@/components/shared/provenance";
import type { EventCardOpened } from "@/components/shared/event-card";
import { SECTION_HEADING } from "@/lib/shared/ui-grammar";
import type { CowTrade } from "@/lib/cow/types";
import { shortAddress, tokenText, type CowTokenLabel } from "@/lib/cow/trade";
import {
  feeExplains,
  feeToken,
  gapBp,
  gapText,
  isCowSettlement,
  pairView,
  type CowSettlement,
} from "@/lib/cow/settlement";
import {
  clearingPrice,
  clearingPriceProv,
  feeChargeProv,
  gapProv,
  otherPairsProv,
  pairCountProv,
  pairPricing,
  pairTradePriceProv,
  priceNumber,
  tradePrice,
} from "@/lib/cow/settlement-provenance";

type Read = { key: string; value: CowSettlement | null };

/** The settlement, once read; null while it is read or where the read failed. */
function useCowSettlement(trade: CowTrade): { value: CowSettlement | null; pending: boolean } {
  const key = `${trade.blockNumber}/${trade.txHash}`;
  const [read, setRead] = useState<Read | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/cow/ethereum/settlement/${key}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: unknown) => (isCowSettlement(d) ? d : null))
      .catch(() => null)
      .then((value) => {
        if (live) setRead({ key, value });
      });
    return () => {
      live = false;
    };
  }, [key]);
  const settled = read?.key === key;
  return { value: settled ? read.value : null, pending: !settled };
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export function CowSettlementPanel({
  settlement: s,
  trade,
  sell,
  buy,
}: {
  settlement: CowSettlement;
  trade: CowTrade;
  sell: CowTokenLabel;
  buy: CowTokenLabel;
}) {
  const view = pairView(s, trade);
  if (!view) return null;
  const pricing = pairPricing(view.self, sell, buy);
  const pairWords = `sold ${tokenText(sell)} for ${tokenText(buy)}`;
  const others =
    view.otherPairs > 0 ? (
      <>
        {" "}
        <Prov info={otherPairsProv(s, view.otherPairs)} value={String(view.otherPairs)}>
          <span>{plural(view.otherPairs, "other pair", "other pairs")}</span>
        </Prov>{" "}
        in this settlement.
      </>
    ) : null;
  const priceTag = (n: number | null) =>
    n == null || !pricing ? "—" : `1 ${tokenText(pricing.base)} = ${priceNumber(n)} ${tokenText(pricing.quote)}`;

  return (
    <div
      className="px-5 py-3 text-xs text-rb-500 space-y-2"
      data-anatomy="T2.2"
      data-cow-settlement-panel={view.pair.length >= 2 ? "pair" : "alone"}
    >
      <div className={`${SECTION_HEADING} text-foreground`}>Settlement</div>
      {view.pair.length < 2 ? (
        <p>
          No other trade in this settlement {pairWords}.{others}
        </p>
      ) : view.onePrice ? (
        <p>
          Cleared at one price:{" "}
          <Prov info={pairCountProv(s, view.pair.length, sell, buy)} value={String(view.pair.length)}>
            <span>{plural(view.pair.length, "trade", "trades")}</span>
          </Prov>{" "}
          {pairWords} at{" "}
          {pricing ? (
            <Prov
              info={pairTradePriceProv(s, view.self, pricing, sell)}
              value={String(tradePrice(view.self, pricing, sell, buy))}
            >
              <span>{priceTag(tradePrice(view.self, pricing, sell, buy))}</span>
            </Prov>
          ) : (
            "one price"
          )}
          .{others}
        </p>
      ) : (
        <>
          <p>
            <Prov info={pairCountProv(s, view.pair.length, sell, buy)} value={String(view.pair.length)}>
              <span>{plural(view.pair.length, "trade", "trades")}</span>
            </Prov>{" "}
            in this settlement {pairWords}.{others}
          </p>
          {view.decoded && pricing && (
            <p>
              Solver&rsquo;s clearing price:{" "}
              <Prov
                info={clearingPriceProv(s, view.self, pricing, sell)}
                value={String(clearingPrice(view.self, pricing, sell, buy))}
              >
                <span className="text-foreground">{priceTag(clearingPrice(view.self, pricing, sell, buy))}</span>
              </Prov>
            </p>
          )}
          <table className="w-full text-left tabular-nums">
            <thead>
              <tr className="text-rb-400">
                <th className="font-normal py-0.5">Owner</th>
                <th className="font-normal py-0.5">Price</th>
                {view.decoded && (
                  <th className="font-normal py-0.5 text-right">
                    <span className="sm:hidden">Gap</span>
                    <span className="max-sm:hidden">From clearing price</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {view.pair.map((t) => {
                const g = gapBp(t);
                const fee = feeExplains(t, s.blockNumber) ? feeToken(t) : null;
                const feeTok = fee ? (fee === sell.address.toLowerCase() ? sell : buy) : null;
                const p = pricing ? tradePrice(t, pricing, sell, buy) : null;
                return (
                  <tr
                    key={t.logIndex}
                    className="align-top"
                    data-cow-settlement-trade={t === view.self ? "self" : "other"}
                  >
                    <td className="py-0.5 pr-3 whitespace-nowrap">
                      {t === view.self ? (
                        <span className="text-foreground">This trade</span>
                      ) : (
                        <Link href={`/ethereum/cow/${t.owner}`} className="link-muted font-mono">
                          {shortAddress(t.owner)}
                        </Link>
                      )}
                    </td>
                    <td className="py-0.5 pr-3">
                      {pricing && p != null ? (
                        <Prov info={pairTradePriceProv(s, t, pricing, sell)} value={String(p)}>
                          <span className="text-foreground">{priceTag(p)}</span>
                        </Prov>
                      ) : (
                        "—"
                      )}
                      {feeTok && (
                        <div>
                          <Prov info={feeChargeProv(s, t, feeTok)} value={tokenText(feeTok)}>
                            <span>
                              CoW charges an order&rsquo;s fees through its own price, in {tokenText(feeTok)}.
                            </span>
                          </Prov>
                        </div>
                      )}
                    </td>
                    {view.decoded && (
                      <td className="py-0.5 text-right">
                        {g != null ? (
                          <Prov info={gapProv(s, t)} value={g.toFixed(4)}>
                            <span className="text-foreground">{gapText(g)}</span>
                          </Prov>
                        ) : (
                          "—"
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

/** The opened card's notes: the settlement panel, read when the card opens. */
export function useCowSettlementOpened(trade: CowTrade, sell: CowTokenLabel, buy: CowTokenLabel): EventCardOpened {
  const { value, pending } = useCowSettlement(trade);
  if (pending) return { notes: <div className="px-5 py-3 text-xs text-rb-500">Reading the settlement…</div> };
  if (!value) return {};
  return { notes: <CowSettlementPanel settlement={value} trade={trade} sell={sell} buy={buy} /> };
}
