// One Transmuter position on the shared position card (rails-ops
// TO-DO-position-card 322, 323): the listing row, and the heads, panel and
// outcome its page's card reuses.
//
// A TRANSMUTER POSITION HAS NO GRADE. Nothing about it is read from the
// contract at a block: the stake, the maturity block and the claim are the
// Transmuter's logs, replayed. So the card states no grade sentence and no
// reading block, only the blocks the logs name.
//
// MATURITY IS A BLOCK, STATED AGAINST A BLOCK. `timeToTransmute` is measured
// in blocks, and the maturity the server serves was settled from the value in
// force when the position was created (never the parameter read at head, which
// has moved six times per mainnet line). Whether it has matured is said against
// the block the line is indexed to. The days are an estimate at the chain's
// block time and say so. A maturing position headlines the date that estimate
// lands on, marked "≈", with the block under it and the arithmetic on hover and
// in the receipt. A matured or claimed one keeps the block: the data carries no
// timestamp for the block it matured at.
//
// THE CLAIM IS TWO AMOUNTS IN TWO UNITS: the converted part, paid out in vault
// shares, and the rest of the stake handed back as the synthetic. Neither is
// drawn in the other's unit. A claimed position is a closed card: its stake and
// maturity as heads, Claimed as the outcome, what was paid out beside it.

import type { ReactNode } from "react";
import { Clock } from "lucide-react";
import { useMountedNow } from "@/hooks/useMountedNow";
import {
  PositionCard,
  type PositionCardHead,
  type PositionCardListingSlots,
  type PositionCardOutcome,
  type PositionCardStatus,
  type PositionPanelColumns,
} from "@/components/shared/position-card";
import { Prov, type Provenance } from "@/components/shared/provenance";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { formatUnitsExact } from "@/lib/utils/format";
import { formatDate } from "@/lib/date";
import type { TransmuterMaturityEstimate } from "@/lib/alchemix/transmuter-provenance";
import { alchemixMarketWord } from "@/lib/alchemix/naming";
import type { AlchemixAmount, AlchemixTransmuterPositionSummary } from "@/types/api/alchemix";
import { transmuterEarlyClaim } from "@/lib/alchemix/transmuter-early-claim";
import { AmountText } from "@/components/shared/amount-text";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { BlockRef } from "@/components/shared/block-ref";
import {
  AlchemixListingIdentity,
  AlchemixTag,
  alchemixChip,
} from "@/components/protocol/alchemix/alchemix-position-card";

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

/** The tag: Claimed, the one end state. A maturing or matured position is
 *  live, and the Matures at headline says which. */
export function transmuterStatus(p: AlchemixTransmuterPositionSummary): PositionCardStatus | null {
  return p.status === "claimed" ? { word: "Claimed", tone: "muted" } : null;
}

/** An amount from a log: the headline form, the exact figure on hover, inside
 *  its receipt where the surface has one. */
function amountFigure(a: AlchemixAmount, symbol: string, prov?: Provenance): ReactNode {
  const exact = formatUnitsExact(a.raw, WAD_DECIMALS);
  const figure = (
    <span title={`${exact} ${symbol}`}>
      <AmountText value={Number(a.raw.split(".")[0]) / 10 ** WAD_DECIMALS} format="headline" symbol={symbol} />
    </span>
  );
  return prov ? (
    <Prov info={prov} value={exact} symbol={symbol}>
      {figure}
    </Prov>
  ) : (
    figure
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

/** The date a maturing position is estimated to mature, from the blocks still
 *  to go at the chain's block time, counted from `nowMs`. Null once matured or
 *  claimed, on a chain with no block time here, or before the browser's clock
 *  has arrived (`nowMs` null): a server render and a browser an hour apart
 *  would otherwise draw two dates. */
export function transmuterMaturityEstimate(
  p: AlchemixTransmuterPositionSummary,
  nowMs: number | null,
): TransmuterMaturityEstimate | null {
  const m = p.maturity;
  const spb = SECONDS_PER_BLOCK[p.chainId];
  if (
    nowMs == null ||
    p.status === "claimed" ||
    m.matured !== false ||
    m.referenceBlock == null ||
    m.blocksRemaining == null ||
    !spb
  ) {
    return null;
  }
  const fromMs = nowMs;
  return {
    referenceBlock: m.referenceBlock,
    blocksRemaining: m.blocksRemaining,
    secondsPerBlock: spb,
    fromMs,
    atMs: fromMs + m.blocksRemaining * spb * 1000,
  };
}

/** The receipts the position page hands the card; the listing has none. */
export interface TransmuterCardProvs {
  staked?: Provenance;
  maturity?: Provenance;
  claimed?: Provenance;
  returned?: Provenance;
}

/** Deposited (the stake) and Matures at. `listing` stamps the stake with its
 *  block; the position page states that block in the panel. */
export function transmuterHeads(
  p: AlchemixTransmuterPositionSummary,
  estimate: TransmuterMaturityEstimate | null,
  prov: TransmuterCardProvs = {},
  listing = false,
): PositionCardHead[] {
  const m = p.maturity;
  let figure: ReactNode = <BlockRef block={m.maturationBlock} size={20} />;
  let title: string | undefined;
  let note: ReactNode = null;
  if (estimate) {
    const about = aboutDuration(estimate.blocksRemaining, p.chainId);
    figure = (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums max-sm:text-lg">
        <Clock className="size-4 shrink-0 text-rb-500" aria-hidden />≈ {formatDate(new Date(estimate.atMs))}
      </span>
    );
    title =
      `Estimated: block ${block(m.maturationBlock)} is ${block(estimate.blocksRemaining)} blocks past block ` +
      `${block(estimate.referenceBlock)}, the block the line is indexed to. At ${estimate.secondsPerBlock} seconds a block ` +
      `that is ${about ?? `${block(estimate.blocksRemaining * estimate.secondsPerBlock)} seconds`} from now.`;
    note = (
      <>
        <BlockRef block={m.maturationBlock} size={12} />
        {about ? ` · ${about}` : ""}
      </>
    );
  } else if (p.status !== "claimed" && m.referenceBlock != null && m.matured) {
    note = (
      <>
        matured; the line is indexed to <BlockRef block={m.referenceBlock} size={12} />
      </>
    );
  }
  return [
    {
      id: "deposited",
      label: "Deposited",
      value: amountFigure(p.staked, p.staked.symbol, prov.staked),
      assets: alchemixChip(p.staked.symbol),
      sub: listing ? <BlockRef block={m.startBlock} size={12} /> : undefined,
    },
    {
      id: "matures-at",
      label: "Matures at",
      value: <span title={title}>{prov.maturity ? <Prov info={prov.maturity}>{figure}</Prov> : figure}</span>,
      sub: note ? <span className="tabular-nums">{note}</span> : undefined,
    },
  ];
}

/** An outstanding position's panel: the blocks the stake and its maturity
 *  name, and the claim not yet made. */
export function transmuterPanel(
  p: AlchemixTransmuterPositionSummary,
  estimate: TransmuterMaturityEstimate | null,
): PositionPanelColumns {
  return [
    [
      {
        id: "staked-at",
        label: "Staked at",
        value: <BlockRef block={p.maturity.startBlock} />,
        tip: "The block the stake was made at, from the Transmuter's PositionCreated log.",
      },
      ...(estimate
        ? [
            {
              id: "maturity-block",
              label: "Maturity block",
              value: <BlockRef block={p.maturity.maturationBlock} />,
              tip: "The block the stake finishes converting at, settled from the conversion time in force when the position was created. The date above is an estimate from it at the chain's block time.",
            },
          ]
        : []),
    ],
    [
      {
        id: "claimed",
        label: "Claimed",
        value: <span className="text-rb-500">Not yet</span>,
        tip: "A claim pays out the converted part of the stake in vault shares and burns the position. None has been made.",
      },
    ],
  ];
}

/** A claimed position's outcome: Claimed, the claim's block (and how early it
 *  came), and what it paid out beside it. `at` is the claim's time where the
 *  surface has its log. */
export function transmuterOutcome(
  p: AlchemixTransmuterPositionSummary,
  prov: TransmuterCardProvs = {},
  at?: number | null,
): PositionCardOutcome | undefined {
  const c = p.claim;
  if (p.status !== "claimed" || !c) return undefined;
  const mytSymbol = c.claimed?.symbol ?? p.mytSymbol ?? "vault shares";
  const early = transmuterEarlyClaim(p);
  const returned =
    c.unclaimed && c.unclaimed.raw !== "0" ? (
      <div className="text-xs mt-0.5 leading-snug text-rb-500">
        and{" "}
        <span className="inline-flex items-center gap-1 tabular-nums">
          {amountFigure(c.unclaimed, c.unclaimed.symbol, prov.returned)}
          <TokenChipIcon symbol={c.unclaimed.symbol} size={14} filterable={false} />
        </span>{" "}
        handed back unconverted
      </div>
    ) : null;
  return {
    word: "Claimed",
    dates: at != null ? [{ at }] : undefined,
    footnote: (
      <div className="text-xs mt-0.5 text-rb-500 tabular-nums">
        <BlockRef block={c.blockNumber} size={12} />
        {early ? `, ${block(early.blocksEarly)} blocks before maturity` : ""}
      </div>
    ),
    extra: {
      label: "Paid out",
      value: (
        <div className="mt-2">
          <span className="inline-flex items-center gap-1.5 text-lg font-bold text-foreground/80">
            {c.claimed ? (
              <>
                {amountFigure(c.claimed, mytSymbol, prov.claimed)}
                <TokenChipIcon symbol={mytSymbol} size={20} filterable={false} />
              </>
            ) : (
              <span className="text-rb-500">Not stated</span>
            )}
          </span>
          {returned}
        </div>
      ),
    },
  };
}

export function transmuterListingSlots(
  p: AlchemixTransmuterPositionSummary,
  session: SessionProtocol,
  estimate: TransmuterMaturityEstimate | null,
): PositionCardListingSlots {
  const holder = p.owner ?? p.claim?.claimer ?? null;
  return {
    surface: "listing",
    status: transmuterStatus(p),
    tag: <AlchemixTag market={alchemixMarketWord(p.syntheticSymbol, "transmuter")} id={p.nftId} />,
    identity: (
      <AlchemixListingIdentity
        chain={p.chainName ?? `chain ${p.chainId}`}
        wallet={holder}
        session={session}
        prefix={p.owner ? undefined : "claimed by"}
      />
    ),
    heads: transmuterHeads(p, estimate, {}, true),
    outcome: transmuterOutcome(p),
    counters: null,
    menu: null,
  };
}

export function TransmuterPositionCard({
  p,
  session,
}: {
  p: AlchemixTransmuterPositionSummary;
  session: SessionProtocol;
}) {
  const now = useMountedNow();
  const estimate = transmuterMaturityEstimate(p, now == null ? null : now * 1000);
  return <PositionCard slots={transmuterListingSlots(p, session, estimate)} />;
}
