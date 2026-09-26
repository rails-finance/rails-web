// One Transmuter position, as a listing row, and the stat columns its page
// reuses.
//
// A TRANSMUTER POSITION HAS NO GRADE. Nothing about it is read from the
// contract at a block: the stake, the maturity block and the claim are the
// Transmuter's own logs, replayed. So the row states no grade sentence and no
// reading block, only the blocks the logs name.
//
// MATURITY IS A BLOCK, STATED AGAINST A BLOCK. `timeToTransmute` is measured
// in blocks, and the maturity the server serves was settled from the value in
// force when the position was created (never the parameter read at head, which
// has moved six times per mainnet line). Whether it has matured is said against
// the block the line is indexed to. The days are an estimate at the chain's
// block time and say so.
//
// THE CLAIM IS TWO AMOUNTS IN TWO UNITS: the converted part, paid out in vault
// shares, and the rest of the stake handed back as the synthetic. Neither is
// drawn in the other's unit.
//
// THE CHROME IS THE HOUSE'S, as on the Alchemist row: PositionCardShell,
// OpenPositionStats, WalletPill, StatValue.

import type { ReactNode } from "react";
import { OpenPositionStats, type OpenPositionStatsColumn } from "@/components/shared/open-position-stats";
import { PositionCardShell } from "@/components/shared/position-card-shell";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { StatValue, StatFootnote } from "@/components/shared/stat-value";
import { WalletPill } from "@/components/shared/wallet-pill";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { formatHeadlineAmount, formatUnitsExact } from "@/lib/utils/format";
import { alchemixPositionName } from "@/lib/alchemix/naming";
import type { AlchemixAmount, AlchemixTransmuterPositionSummary } from "@/types/api/alchemix";

const block = (n: number) => n.toLocaleString("en-US");

/** The synthetic and every vault share are 18 decimals on every line. */
const WAD_DECIMALS = 18;

/** Seconds per block, for the estimate beside a block count and nowhere else:
 *  twelve-second slots on Ethereum, two seconds on Base. */
const SECONDS_PER_BLOCK: Record<number, number> = { 1: 12, 8453: 2 };

export type TransmuterState = "maturing" | "matured" | "claimed";

export function transmuterState(p: AlchemixTransmuterPositionSummary): TransmuterState {
  if (p.status === "claimed") return "claimed";
  return p.maturity.matured ? "matured" : "maturing";
}

const STATE_WORD: Record<TransmuterState, string> = {
  maturing: "Maturing",
  matured: "Matured",
  claimed: "Claimed",
};

/** The listing axis: the roster's lifecycle-pill frame, carrying the
 *  Transmuter's own three words. */
export function TransmuterStatePill({ state }: { state: TransmuterState }) {
  const cls =
    state === "claimed"
      ? "bg-rb-300 dark:bg-rb-700 text-foreground/70"
      : state === "matured"
        ? "bg-teal-500/15 text-teal-700 dark:text-teal-300"
        : "bg-blue-500/15 text-blue-700 dark:text-blue-300";
  return (
    <span className={`font-bold tracking-wider uppercase px-2 py-0.5 rounded-xs text-xs ${cls}`}>
      {STATE_WORD[state]}
    </span>
  );
}

/** An amount from a log: the headline form, the exact figure on hover. */
function amountValue(a: AlchemixAmount, symbol: string, prov?: Provenance): ReactNode {
  const n = Number(a.raw.split(".")[0]) / 10 ** WAD_DECIMALS;
  const figure = (
    <>
      {formatHeadlineAmount(n)} {symbol}
    </>
  );
  return (
    <StatValue title={`${formatUnitsExact(a.raw, WAD_DECIMALS)} ${symbol}`}>
      {prov ? (
        <Prov info={prov} value={formatUnitsExact(a.raw, WAD_DECIMALS)} symbol={symbol}>
          {figure}
        </Prov>
      ) : (
        figure
      )}
    </StatValue>
  );
}

/** "about 3 days", from a block count at the chain's block time. */
export function aboutDuration(blocks: number, chainId: number): string | null {
  const spb = SECONDS_PER_BLOCK[chainId];
  if (!spb) return null;
  const hours = (blocks * spb) / 3600;
  if (hours < 1) return "under an hour";
  if (hours < 48) return `about ${Math.round(hours)} hours`;
  return `about ${Math.round(hours / 24)} days`;
}

export function stakedColumn(p: AlchemixTransmuterPositionSummary, prov?: Provenance): OpenPositionStatsColumn {
  return {
    label: "Staked",
    value: amountValue(p.staked, p.staked.symbol, prov),
    footnote: (
      <StatFootnote>
        <span className="tabular-nums">at block {block(p.maturity.startBlock)}</span>
      </StatFootnote>
    ),
  };
}

export function maturityColumn(p: AlchemixTransmuterPositionSummary, prov?: Provenance): OpenPositionStatsColumn {
  const m = p.maturity;
  const figure = <span className="tabular-nums">block {block(m.maturationBlock)}</span>;
  let note: ReactNode = null;
  if (p.status !== "claimed" && m.referenceBlock != null) {
    if (m.matured) {
      note = <>matured; the line is indexed to block {block(m.referenceBlock)}</>;
    } else if (m.blocksRemaining != null) {
      const about = aboutDuration(m.blocksRemaining, p.chainId);
      note = (
        <>
          {block(m.blocksRemaining)} blocks to go from block {block(m.referenceBlock)}
          {about ? `, ${about}` : ""}
        </>
      );
    }
  }
  return {
    label: "Matures at",
    value: <StatValue>{prov ? <Prov info={prov}>{figure}</Prov> : figure}</StatValue>,
    footnote: note ? (
      <StatFootnote>
        <span className="tabular-nums">{note}</span>
      </StatFootnote>
    ) : undefined,
  };
}

export function claimColumn(
  p: AlchemixTransmuterPositionSummary,
  prov?: { claimed?: Provenance; returned?: Provenance },
): OpenPositionStatsColumn {
  const c = p.claim;
  if (!c) {
    return {
      label: "Claimed",
      value: <StatValue color="text-rb-500">Not yet</StatValue>,
    };
  }
  const mytSymbol = c.claimed?.symbol ?? p.mytSymbol ?? "vault shares";
  const returned =
    c.unclaimed && c.unclaimed.raw !== "0" ? (
      <div className="mt-0.5 leading-snug">
        and{" "}
        <span className="tabular-nums">
          {prov?.returned ? (
            <Prov
              info={prov.returned}
              value={formatUnitsExact(c.unclaimed.raw, WAD_DECIMALS)}
              symbol={c.unclaimed.symbol}
            >
              {formatHeadlineAmount(Number(c.unclaimed.raw) / 1e18)} {c.unclaimed.symbol}
            </Prov>
          ) : (
            <>
              {formatHeadlineAmount(Number(c.unclaimed.raw) / 1e18)} {c.unclaimed.symbol}
            </>
          )}
        </span>{" "}
        handed back unconverted
      </div>
    ) : null;
  return {
    label: "Claimed",
    value: c.claimed ? (
      amountValue(c.claimed, mytSymbol, prov?.claimed)
    ) : (
      <StatValue color="text-rb-500">Not stated</StatValue>
    ),
    footnote: (
      <StatFootnote>
        <span className="tabular-nums">at block {block(c.blockNumber)}</span>
        {returned}
      </StatFootnote>
    ),
  };
}

export function TransmuterPositionCard({
  p,
  session,
}: {
  p: AlchemixTransmuterPositionSummary;
  session: SessionProtocol;
}) {
  const holder = p.owner ?? p.claim?.claimer ?? null;
  return (
    <PositionCardShell>
      <OpenPositionStats
        statusPill={<TransmuterStatePill state={transmuterState(p)} />}
        leadingIdentity={
          <>
            <span className="text-xs font-bold tracking-wide text-foreground/80">
              {alchemixPositionName(p.syntheticSymbol, p.nftId, "transmuter")}
            </span>
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-rb-500">
              <span>{p.chainName ?? `chain ${p.chainId}`}</span>
              {holder ? (
                <span className="inline-flex items-center gap-1.5">
                  {p.owner ? null : "claimed by"}
                  <WalletPill wallet={holder} ensName={null} filterProtocol={session} bookmarkProtocol={session} />
                </span>
              ) : null}
            </span>
          </>
        }
        columns={[stakedColumn(p), maturityColumn(p), claimColumn(p)]}
      />
    </PositionCardShell>
  );
}
