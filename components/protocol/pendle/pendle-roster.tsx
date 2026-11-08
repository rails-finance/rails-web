"use client";

// The Pendle market roster: every market the router record names, grouped by
// the protocol behind its yield token (a Rails label), live markets by default.
// Each row opens the market's page.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { RevealTip } from "@/components/shared/reveal-tip";
import { BlockRef } from "@/components/shared/block-ref";
import { CARD_INSET_START, SECTION_HEADING } from "@/lib/shared/ui-grammar";
import {
  PENDLE_CHAIN_ID,
  amountText,
  apyText,
  assetDecimals,
  assetSymbol,
  exact,
  marketName,
  maturityDate,
  maturityWords,
} from "@/lib/pendle/format";
import { impliedApyProv, maturityProv, tvlProv, underlyingProv } from "@/lib/pendle/provenance";
import { UNDERLYING_LABEL_TIP, underlyingProtocol } from "@/lib/pendle/underlying";
import { pendleMarketHref, pendleWalletHref } from "@/lib/pendle/routes";
import { FrontDoorSearch } from "@/components/shared/front-door-search";
import type { PendleRoster, PendleRosterEntry } from "@/lib/pendle/types";

type Show = "live" | "expired" | "all";
const UNLABELLED = "Not labelled";

function Row({ m, block, at }: { m: PendleRosterEntry; block: number; at: number }) {
  const t = m.tokens;
  const dec = assetDecimals(t);
  const asset = assetSymbol(t);
  return (
    <tr className="border-t border-rb-200 dark:border-rb-800" data-pendle-roster-row={t.market.address}>
      <td className="py-2.5 pr-3">
        <Link
          href={pendleMarketHref(t.market.address)}
          className="inline-flex min-w-0 items-center gap-2 hover:underline"
        >
          <TokenChipIcon symbol={t.pt.symbol ?? ""} address={t.pt.address} size={20} filterable={false} />
          <span className="truncate font-medium text-foreground">{marketName(t)}</span>
        </Link>
      </td>
      <td className="py-2.5 pr-3 text-right tabular-nums">
        {m.impliedApy == null ? (
          <span className="text-rb-500">{m.expired ? "Matured" : "–"}</span>
        ) : (
          <Prov info={impliedApyProv(t.market.address, block, null)} value={m.impliedApy.toFixed(6)}>
            {apyText(m.impliedApy)}
          </Prov>
        )}
      </td>
      <td className="hidden py-2.5 pr-3 text-right tabular-nums sm:table-cell">
        {m.tvl?.asset == null ? (
          "–"
        ) : (
          <Prov info={tvlProv(t.market.address, block)} value={exact(m.tvl.asset, dec) ?? m.tvl.asset} symbol={asset}>
            {amountText(m.tvl.asset, dec)}
          </Prov>
        )}{" "}
        <span className="text-rb-500">{asset}</span>
      </td>
      <td className="py-2.5 text-right">
        <Prov info={maturityProv(t.market.address, t.expiry, block)} value={String(t.expiry)}>
          {maturityDate(t.expiry)}
        </Prov>
        <div className="text-[11px] text-rb-500">{maturityWords(t.expiry, at)}</div>
      </td>
    </tr>
  );
}

export function PendleRosterView({ roster, at }: { roster: PendleRoster; at: number }) {
  const registry = useReceiptRegistry();
  const [show, setShow] = useState<Show>("live");
  const groups = useMemo(() => {
    const list = roster.markets.filter((m) =>
      show === "all" ? true : show === "live" ? m.expired === false : m.expired !== false,
    );
    const by = new Map<string, PendleRosterEntry[]>();
    for (const m of list) {
      const k = underlyingProtocol(m.tokens.yieldToken.address) ?? UNLABELLED;
      (by.get(k) ?? by.set(k, []).get(k)!).push(m);
    }
    for (const ms of by.values()) ms.sort((a, b) => a.tokens.expiry - b.tokens.expiry);
    return [...by.entries()].sort(([a], [b]) => (a === UNLABELLED ? 1 : b === UNLABELLED ? -1 : a.localeCompare(b)));
  }, [roster, show]);
  const counts = {
    live: roster.markets.filter((m) => m.expired === false).length,
    expired: roster.markets.filter((m) => m.expired !== false).length,
    all: roster.markets.length,
  };
  return (
    <ProvReceiptsScope registry={registry}>
      <div className="space-y-6" data-pendle-roster="">
        <p className={`text-xs text-rb-500 ${CARD_INSET_START}`} data-pendle-asof={roster.block}>
          Every market Pendle&rsquo;s routers have named in the router record Rails holds, read at block{" "}
          <BlockRef block={roster.block} chainId={PENDLE_CHAIN_ID} />. Markets are grouped by the protocol behind each
          yield token, a Rails label.
        </p>
        <div className={`flex flex-wrap gap-2 ${CARD_INSET_START}`} role="group" aria-label="Show markets">
          {(["live", "expired", "all"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={show === k}
              onClick={() => setShow(k)}
              className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold ${show === k ? "border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-300" : "border-rb-300 text-rb-500 dark:border-rb-700"}`}
              data-pendle-roster-show={k}
            >
              {k === "live" ? "Live" : k === "expired" ? "Matured" : "All"}{" "}
              <span className="ml-1 tabular-nums">{counts[k]}</span>
            </button>
          ))}
        </div>
        {groups.map(([label, ms]) => {
          const first = ms[0];
          return (
            <section key={label} className="space-y-2" data-pendle-group={label}>
              <h2 className={`flex items-center gap-2 ${SECTION_HEADING} ${CARD_INSET_START}`}>
                {label === UNLABELLED ? (
                  label
                ) : (
                  <RevealTip tip={UNDERLYING_LABEL_TIP} label={UNDERLYING_LABEL_TIP}>
                    <span>
                      <Prov info={underlyingProv(label, first.tokens.yieldToken)} value={label}>
                        {label}
                      </Prov>{" "}
                      <span className="text-[11px] font-normal text-rb-400">Rails label</span>
                    </span>
                  </RevealTip>
                )}
                <span className="tabular-nums font-normal text-rb-500">{ms.length}</span>
              </h2>
              <div className="rounded-xl bg-raised px-4 py-1 sm:px-5">
                <table className="w-full table-fixed text-sm">
                  <thead>
                    <tr className="text-left text-xs text-rb-500">
                      <th className="w-[44%] py-2 font-normal">Market</th>
                      <th className="py-2 pr-3 text-right font-normal">Implied APY</th>
                      <th className="hidden py-2 pr-3 text-right font-normal sm:table-cell">Pool</th>
                      <th className="py-2 text-right font-normal">Maturity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ms.map((m) => (
                      <Row key={m.tokens.market.address} m={m} block={roster.block} at={at} />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
        {groups.length === 0 && <p className={`text-sm text-rb-500 ${CARD_INSET_START}`}>No market to show.</p>}
      </div>
    </ProvReceiptsScope>
  );
}

/** The search (H15) landing on a wallet's Pendle positions. */
export function PendleWalletSearch() {
  return <FrontDoorSearch href={(wallet) => pendleWalletHref(wallet)} />;
}
