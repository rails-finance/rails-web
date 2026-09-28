"use client";

// Aave V4 on Base: when each price this position is valued at was published,
// and which of its reserves the spoke has paused.
// ----------------------------------------------------------------------------
// Six of the Mag7 spoke's collateral prices are Coinbase stock feeds that
// publish 24/5 and hold their last value outside those hours; the spoke's
// oracle does not check a feed's age (rails-ops reference/tokenised-stock-
// collateral-pricing.md). So every figure on this card rests on a price whose
// age the page states, the Morpho position page's 2026-09-19 discipline:
// latestRoundData()'s updatedAt, and how long before the oracle read it was.
// No market-hours logic, no threshold, no tone. A reserve the spoke reports
// paused (getReserveConfig().paused, a split or other corporate action) is
// stated as paused, in words. So is a stock Coinbase has paused at its token
// registry (the api's registryPaused): the spoke does not read that flag, so
// the reserve stays open at the price the paused feed holds.

import { useEffect, useState } from "react";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { publishedText, ageText } from "@/lib/morpho/oracle-age";
import { useAaveV4OracleRead } from "@/lib/aave-v4/use-oracle-prices";
import { useAaveV4Deployment } from "@/lib/aave-v4/deployment";
import type { AaveV4SpokeChainReserve } from "@/lib/api/fetch-aave-v4-spoke-position";
import { formatNumber } from "@/lib/utils/format";

interface ReserveFlags {
  reserveId: number;
  symbol: string | null;
  paused: boolean;
  frozen: boolean;
  registryPaused?: boolean | null;
}

const MAG7_ORACLE = { name: "Mag7 spoke AaveOracle", address: "0xabaf048fd7675ea34a84332371ffd5d55e322a47" };

function useReserveFlags(apiRoot: string): ReserveFlags[] | null {
  const [flags, setFlags] = useState<ReserveFlags[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`${apiRoot}/reserves`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { reserves?: ReserveFlags[] } | null) => {
        if (!cancelled && d?.reserves) setFlags(d.reserves);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [apiRoot]);
  return flags;
}

export function AaveV4BaseReserveNotice({ reserves }: { reserves: AaveV4SpokeChainReserve[] }) {
  const { apiRoot } = useAaveV4Deployment();
  const oracle = useAaveV4OracleRead();
  const flags = useReserveFlags(apiRoot);
  const held = reserves.filter(
    (r) => BigInt(r.supplyBalanceRaw || "0") > BigInt(0) || BigInt(r.debtBalanceRaw || "0") > BigInt(0),
  );
  if (held.length === 0) return null;

  const readTs = oracle?.blockTimestamp ?? null;
  const rows = held.flatMap((r) => {
    const p = oracle?.prices[r.address.toLowerCase()];
    if (!p || p.updatedAt == null || readTs == null) return [];
    const prov: Provenance = {
      kind: "chain",
      pclass: "oracle",
      summary: `The ${r.symbol} price the Mag7 spoke values this position at, and when the Chainlink feed behind it last published. getReservePrice(${r.reserveId}) on the spoke's oracle gives the price; the oracle's getReserveSource(${r.reserveId}) names the feed, and its latestRoundData() gives round ${p.roundId ?? "—"} and its updatedAt, both read at block ${oracle?.blockNumber?.toLocaleString("en-US") ?? "—"}. The oracle does not check how old the round is.`,
      contract: MAG7_ORACLE,
      via: `GET /api/oracle/aave-v4-base · getReservePrice + latestRoundData at block ${oracle?.blockNumber ?? "—"}`,
      source: { block: oracle?.blockNumber ?? undefined, network: "Base" },
    };
    return [
      <li key={r.reserveId}>
        <Prov info={prov}>
          {r.symbol} {formatNumber(p.usd)} USD
        </Prov>
        , published {publishedText(p.updatedAt, readTs)} ({ageText(readTs - p.updatedAt)} before this read)
      </li>,
    ];
  });
  const paused = held.filter((r) => flags?.find((f) => f.reserveId === r.reserveId)?.paused);
  const frozen = held.filter((r) => flags?.find((f) => f.reserveId === r.reserveId && !f.paused)?.frozen);
  const registryPaused = held.filter((r) => flags?.find((f) => f.reserveId === r.reserveId)?.registryPaused);

  if (rows.length === 0 && paused.length === 0 && frozen.length === 0 && registryPaused.length === 0) return null;
  return (
    <div className="px-4 md:px-6 pb-4 -mt-1 text-xs text-rb-500 space-y-1.5 max-w-prose">
      {rows.length > 0 && (
        <>
          <p>Prices this position is valued at, from the spoke&rsquo;s oracle:</p>
          <ul className="list-disc pl-4 space-y-0.5">{rows}</ul>
        </>
      )}
      {paused.map((r) => (
        <p key={`p${r.reserveId}`}>
          The {r.symbol} reserve is paused on the Mag7 spoke: nothing can be supplied, withdrawn, borrowed or repaid in
          it until it is unpaused. Aave pauses a stock&rsquo;s reserve for a corporate action such as a split.
        </p>
      ))}
      {frozen.map((r) => (
        <p key={`f${r.reserveId}`}>
          The {r.symbol} reserve is frozen on the Mag7 spoke: it takes no new supply or borrowing; withdrawals and
          repayments go through.
        </p>
      ))}
      {registryPaused.map((r) => (
        <p key={`r${r.reserveId}`}>
          Coinbase has paused {r.symbol} at its token registry, which holds the stock&rsquo;s price feed at its last
          value during a corporate action. The Mag7 spoke does not read that flag, so the {r.symbol} reserve stays open,
          valued at the held price.
        </p>
      ))}
    </div>
  );
}
