// The recent configuration changes under a MetaMorpho vault's "What protects
// it" (V9.1; rails-ops ui-jobs 554, point 1): rails-server's changes route
// read once, the 30 days to the page's block worked into words
// (lib/vaults/config-changes.ts) and receipts
// (lib/vaults/config-changes-provenance.ts), ready for the client section.
//
// SERVER-ONLY: the read uses RAILS_API_URL and the bearer token.

import "server-only";
import type { Provenance } from "@/components/shared/provenance";
import { fetchMetaMorphoChanges, type MetaMorphoChangesChainId } from "@/lib/api/fetch-metamorpho-changes";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";
import { formatCompact } from "@/lib/shared/format-compact";
import { formatDate } from "@/lib/date";
import { CONFIG_EVENTS, WINDOW_DAYS, changeRows, coveredThrough, type ChangeFormat } from "@/lib/vaults/config-changes";
import { configChangeCountProv, configChangeDateProv, configChangeProv } from "@/lib/vaults/config-changes-provenance";

/** What the read needs from the vault page: the vault, its asset, its markets, its block. */
export interface ConfigChangesSubject {
  chainId: MetaMorphoChangesChainId;
  vault: { address: string; name: string };
  asset: { symbol: string; decimals: number };
  /** The markets of the withdraw queue at the page's block. */
  markets: { id: string; collateralSymbol: string | null; isIdle: boolean; lltv: number }[];
  /** The page's block and its time (seconds); a null time falls back to the read's clock. */
  asOf: { block: number; time: number | null };
}

export interface ConfigChangeRowView {
  key: string;
  event: string;
  date: string;
  dateProv: Provenance;
  text: string;
  textProv: Provenance;
  block: number;
  txHref: string;
  /** SubmitCap with no acceptance in the record. */
  waiting: boolean;
}

export type ConfigChangesView =
  | { kind: "unread" }
  | {
      kind: "ok";
      chainId: number;
      count: number;
      countProv: Provenance;
      /** The last block Rails's index holds for the vault; null before its first read. */
      through: number | null;
      rows: ConfigChangeRowView[];
    };

const lltvWord = (x: number) => `${(x * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;

/** Each market's name: its collateral symbol, with the LLTV where two markets share one. */
function marketNames(markets: ConfigChangesSubject["markets"]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const m of markets)
    if (m.collateralSymbol) counts.set(m.collateralSymbol, (counts.get(m.collateralSymbol) ?? 0) + 1);
  return new Map(
    markets.map((m) => [
      m.id.toLowerCase(),
      m.isIdle || !m.collateralSymbol
        ? "the idle market"
        : (counts.get(m.collateralSymbol) ?? 0) > 1
          ? `the ${m.collateralSymbol} market (LLTV ${lltvWord(m.lltv)})`
          : `the ${m.collateralSymbol} market`,
    ]),
  );
}

/** `timelock`: the vault's timelock at the page's read, awaited after the route answers; it dates a
 *  SubmitCap that no SetTimelock in the answer precedes. */
export async function readConfigChanges(
  s: ConfigChangesSubject,
  timelockRead: Promise<number | null>,
): Promise<ConfigChangesView> {
  const answer = await fetchMetaMorphoChanges(s.chainId, s.vault.address, CONFIG_EVENTS);
  if (answer.kind !== "ok") return { kind: "unread" };
  const timelock = await timelockRead.catch(() => null);
  const d = answer.data;
  const time = s.asOf.time ?? Math.floor(Date.now() / 1000);
  const asOf = { block: s.asOf.block, time };
  const names = marketNames(s.markets);
  const f: ChangeFormat = {
    date: formatDate,
    amount: (raw) => `${formatCompact(Number(raw) / 10 ** s.asset.decimals)} ${s.asset.symbol}`,
    market: (id) => names.get(id.toLowerCase()) ?? null,
  };
  const rows = changeRows(d.changes, asOf, f, timelock);
  const vault = { name: s.vault.name, address: s.vault.address.toLowerCase() };
  return {
    kind: "ok",
    chainId: s.chainId,
    count: rows.length,
    countProv: configChangeCountProv(
      s.chainId,
      vault,
      rows.length,
      { fromTime: time - WINDOW_DAYS * 86_400, block: s.asOf.block },
      d.coverage,
    ),
    through: coveredThrough(d.coverage),
    rows: rows.map(({ change: c, words: w }) => ({
      key: `${c.blockNumber}:${c.txIndex}:${c.logIndex}:${c.event}`,
      event: c.event,
      date: formatDate(c.blockTime),
      dateProv: configChangeDateProv(s.chainId, vault, c, d.coverage),
      text: w.text,
      textProv: configChangeProv(s.chainId, vault, c, w, d.coverage),
      block: c.blockNumber,
      txHref: explorerUrl(s.chainId as ChainId, "tx-logs", c.txHash),
      waiting: c.event === "SubmitCap" && !w.waiting?.acceptedBy,
    })),
  };
}
