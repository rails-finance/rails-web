"use client";

// Liquity V1 event detail (the opened card, T2) — the Liquity V2 grid: the
// Trove's collateral (with its USD value at this block), its debt (with what
// the event added or burned itemised), its collateral ratio before → after and
// the ETH price at this block.
//
// Before and after are the captured TroveUpdated absolutes, formatted from
// their decimal strings (lib/liquity-v1/event-figures.ts), so consecutive cards
// agree to the figure. The price is the PriceFeed's lastGoodPrice at the
// block: the row's own capture on a redemption or liquidation, otherwise the
// receipt read (/api/chain/liquity-v1/event), which also carries the fee, the
// reserve and, on a liquidation, where the debt and ETH went. A full
// redemption's leftover ETH, and whether it has been claimed, comes from the
// CollSurplusPool read.

import type { ReactNode } from "react";
import type { LiquityV1Context } from "@/lib/shared/types/event-shape";
import { Prov, type Provenance } from "@/components/shared/provenance";
import {
  ClosedLabel,
  DeltaToggle,
  PriceChipShell,
  StatCard,
  StatSubline,
  StateTransition,
  ValuePill,
  changeTone,
} from "@/components/shared/state-transition";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { LedgerCell } from "@/components/shared/event-ledger";
import { ledgerFigure, useLedgerDecimals } from "@/components/shared/event-ledger-context";
import { useUsdShown } from "@/components/shared/timeline-display-context";
import { LinkedAddress } from "@/components/shared/linked-address";
import { LiquidationForensics, type LiquidationForensicsProps } from "@/components/shared/liquidation-forensics";
import {
  collAfterProv,
  debtAfterProv,
  collBeforeProv,
  debtBeforeProv,
  collDeltaProv,
  debtDeltaProv,
  atBlockPriceProv,
  eventPriceProv,
  collUsdAtBlockProv,
  ratioAtBlockProv,
  borrowingFeeProv,
  lusdReceivedProv,
  reserveProv,
  ownerRepaidProv,
  liqSeizedUsdProv,
  liqClearedFaceProv,
  liqPremiumProv,
  liqRouteProv,
  redemptionLegProv,
  redemptionNetProv,
  type LiquityV1Coords,
} from "@/lib/liquity-v1/event-provenance";
import { COLLATERAL_SYMBOL, DEBT_SYMBOL } from "@/lib/liquity-v1/asset-catalog";
import {
  LIQUITY_V1_RESERVE,
  fmtEth,
  fmtLusd,
  fmtPct,
  fmtUsd,
  fmtUsdSigned,
  ratioOf,
  redemptionSplit,
  sidesOf,
} from "@/lib/liquity-v1/event-figures";
import {
  useLiquityV1EventReadState,
  useLiquityV1Surplus,
  type LiquityV1EventRead,
} from "@/lib/liquity-v1/use-event-read";
import { formatUsdValue } from "@/lib/utils/format";
import { formatDate } from "@/lib/date";

export interface LiquityV1EventDetailProps {
  ctx: LiquityV1Context;
  txHash?: string;
  blockNumber?: number;
  /** The Trove's owner — the receipt read filters the fee and transfers on it. */
  wallet?: string;
  /** The PriceFeed price now, for a redemption's net outcome at today's price. */
  currentPrice?: number | null;
}

const P = ({ info, value, children }: { info?: Provenance; value?: string; children: ReactNode }) =>
  info ? (
    <Prov info={info} value={value}>
      {children}
    </Prov>
  ) : (
    <>{children}</>
  );

const EPS = 1e-9;

/** The event's price: the row's capture where it has one, else the receipt read's. */
export function liquityV1EventPrice(ctx: LiquityV1Context, read: LiquityV1EventRead | null): number | null {
  const captured = ctx.priceAtBlock?.usd;
  if (captured != null && captured > 0) return captured;
  return read?.priceUsd != null && read.priceUsd > 0 ? read.priceUsd : null;
}

function buildV1LiquidationForensics(
  ctx: LiquityV1Context,
  coords: LiquityV1Coords,
): LiquidationForensicsProps | undefined {
  const price = ctx.priceAtBlock;
  const seizedAmt = Number(ctx.collBefore);
  const clearedAmt = Number(ctx.debtBefore);
  if (!price || !Number.isFinite(seizedAmt) || !Number.isFinite(clearedAmt) || seizedAmt <= 0 || clearedAmt <= 0)
    return undefined;
  const seizedUsd = seizedAmt * price.usd;
  const clearedUsd = clearedAmt;
  return {
    seized: {
      symbol: COLLATERAL_SYMBOL,
      usd: seizedUsd,
      usdProv: liqSeizedUsdProv(coords, { amount: `${ctx.collBefore} ${COLLATERAL_SYMBOL}`, priceUsd: price.usd }),
    },
    cleared: {
      symbol: DEBT_SYMBOL,
      usd: clearedUsd,
      usdProv: liqClearedFaceProv(coords, { amount: `${ctx.debtBefore} ${DEBT_SYMBOL}` }),
    },
    premium: seizedUsd / clearedUsd - 1,
    premiumProv: liqPremiumProv(coords, {
      seizedUsd: formatUsdValue(seizedUsd),
      clearedUsd: formatUsdValue(clearedUsd),
    }),
    pricePills: [
      {
        symbol: COLLATERAL_SYMBOL,
        priceUsd: price.usd,
        priceProv: atBlockPriceProv(coords, price.usd),
        note: "Liquity's price feed at block",
      },
    ],
  };
}

function Transition({
  before,
  after,
  showBefore,
  closed,
  delta,
  symbol,
  afterExtra,
  beforeExtra,
  provBefore,
  provAfter,
}: {
  before: string;
  after: string;
  showBefore: boolean;
  closed?: boolean;
  delta?: ReactNode;
  symbol?: string;
  afterExtra?: ReactNode;
  beforeExtra?: ReactNode;
  provBefore?: Provenance;
  provAfter?: Provenance;
}) {
  const changed = before !== after;
  return (
    <StateTransition>
      {showBefore && (
        <DeltaToggle
          before={<P info={provBefore}>{before}</P>}
          delta={closed ? null : (delta ?? null)}
          beforeExtra={beforeExtra}
        />
      )}
      {closed ? (
        <ClosedLabel />
      ) : (
        <P info={provAfter}>
          <span className={`text-sm font-semibold tabular-nums ${changeTone(changed)}`}>{after}</span>
        </P>
      )}
      {symbol && <TokenChipIcon symbol={symbol} size={16} />}
      {afterExtra}
    </StateTransition>
  );
}

export function LiquityV1EventDetail({ ctx, txHash, blockNumber, wallet, currentPrice }: LiquityV1EventDetailProps) {
  const coords: LiquityV1Coords = { txHash, blockNumber, wallet };
  const { read, pending: readPending } = useLiquityV1EventReadState(txHash, wallet);
  const s = sidesOf(ctx);
  const split = redemptionSplit(ctx);
  const surplus = useLiquityV1Surplus(
    split?.full || ctx.eventType === "liquidation" ? txHash : null,
    split?.full || ctx.eventType === "liquidation" ? wallet : null,
  );
  const price = liquityV1EventPrice(ctx, read);
  const usdShown = useUsdShown();

  const isOpen = ctx.eventType === "openTrove";
  const isClose = ctx.eventType === "closeTrove";
  const isLiq = ctx.eventType === "liquidation";
  const isRedemption = ctx.eventType === "redemption";
  const ends = isClose || isLiq || (isRedemption && s.debtAfter <= EPS);

  // ── Collateral ──
  const collChanged = Math.abs(s.collDelta) > EPS;
  // The closed cells state their figures at the decimals the opened ledger prints.
  const collDec = useLedgerDecimals("collateral");
  const debtDec = useLedgerDecimals("debt");
  const fc = (n: number) => ledgerFigure(n, collDec, fmtEth(n));
  const fl = (n: number) => ledgerFigure(n, debtDec, fmtLusd(n));
  const collBeforeStr = fc(s.collBefore);
  const collAfterStr = fc(s.collAfter);
  const collDeltaStr = `${s.collDelta >= 0 ? "+" : "−"}${fc(Math.abs(s.collDelta))}`;
  const usdAfter = price != null && s.collAfter > EPS ? s.collAfter * price : null;
  const usdBefore = price != null && s.collBefore > EPS ? s.collBefore * price : null;

  // ── Debt ──
  const debtChanged = Math.abs(s.debtDelta) > EPS;
  const debtBeforeStr = fl(s.debtBefore);
  const debtAfterStr = fl(s.debtAfter);
  const debtDeltaStr = `${s.debtDelta >= 0 ? "+" : "−"}${fl(Math.abs(s.debtDelta))}`;

  // What the debt change was made of, where the receipt says.
  const fee = read?.borrowingFee != null ? Number(read.borrowingFee) : null;
  const received = read ? Number(read.lusdMintedToOwner) : null;
  const ownerBurned = read ? Number(read.lusdBurnedFromOwner) : null;
  const debtLines: ReactNode[] = [];
  if (s.debtDelta > EPS && read) {
    if (received != null && received > EPS)
      debtLines.push(
        <span key="recv">
          <P info={lusdReceivedProv(coords, read.lusdMintedToOwner)}>{fmtLusd(received)}</P> received
        </span>,
      );
    if (fee != null)
      debtLines.push(
        <span key="fee">
          <P info={borrowingFeeProv(coords, read.borrowingFee as string)}>{fmtLusd(fee)}</P> fee
          {received != null && received > EPS && fee > 0 && <> ({fmtPct(fee / received)})</>}
        </span>,
      );
    if (isOpen && Number(read.reserveMinted) > EPS)
      debtLines.push(
        <span key="res">
          <P info={reserveProv(coords, "minted")}>{fmtLusd(Number(read.reserveMinted))}</P> reserve
        </span>,
      );
  }
  if (isClose && read && ownerBurned != null) {
    debtLines.push(
      <span key="paid">
        owner repaid <P info={ownerRepaidProv(coords, read.lusdBurnedFromOwner)}>{fmtLusd(ownerBurned)}</P>
      </span>,
    );
    if (Number(read.reserveBurned) > EPS)
      debtLines.push(
        <span key="burn">
          <P info={reserveProv(coords, "burned")}>{fmtLusd(Number(read.reserveBurned))}</P> reserve burned
        </span>,
      );
  }
  if (split?.full) {
    const splitProv: Provenance = {
      kind: "chain-derived",
      pclass: "indexed",
      summary:
        "Debt a full redemption cancelled, in two parts — the redeemer's LUSD paid for all of it except the last 200 LUSD, the liquidation reserve, which the GasPool burned (TroveManager._redeemCloseTrove).",
      formula: "debt before − 200 LUSD reserve",
      inputs: [{ label: "debt before", value: ctx.debtBefore, kind: "chain", pclass: "emitted" }],
    };
    debtLines.push(
      <span key="rd">
        <P info={splitProv}>{fmtLusd(split.lusdRedeemed)}</P> redeemed
      </span>,
    );
    debtLines.push(
      <span key="rs">
        <P info={splitProv}>{fmtLusd(split.reserveBurned)}</P> reserve burned
      </span>,
    );
  }

  // ── Collateral ratio, both sides at this block's price ──
  const crBefore = isOpen ? null : ratioOf(s.collBefore, s.debtBefore, price);
  const crAfter = ends ? null : ratioOf(s.collAfter, s.debtAfter, price);
  const crBeforeStr = crBefore != null ? fmtPct(crBefore) : null;
  const crAfterStr = crAfter != null ? fmtPct(crAfter) : null;

  const forensics = isLiq ? buildV1LiquidationForensics(ctx, coords) : undefined;

  return (
    <>
      <div className="px-5 py-2">
        <div className="grid grid-cols-1 gap-2.5 sm:auto-rows-fr sm:grid-cols-2 sm:has-[[data-ledger-span]]:auto-rows-auto">
          <LedgerCell label="Collateral" side="collateral">
            <Transition
              before={collBeforeStr}
              after={collAfterStr}
              showBefore={!isOpen && collChanged}
              closed={ends}
              symbol={COLLATERAL_SYMBOL}
              provBefore={collBeforeProv(coords)}
              provAfter={collAfterProv(coords)}
              delta={
                <P info={collDeltaProv(coords, { after: ctx.collAfter, before: ctx.collBefore })}>{collDeltaStr}</P>
              }
              beforeExtra={
                (isRedemption || isLiq) && usdBefore != null && usdShown(COLLATERAL_SYMBOL, usdBefore, s.collBefore) ? (
                  <P
                    info={collUsdAtBlockProv(coords, {
                      coll: ctx.collBefore,
                      priceUsd: price as number,
                      side: "before",
                    })}
                  >
                    <ValuePill>{fmtUsd(usdBefore)}</ValuePill>
                  </P>
                ) : undefined
              }
              afterExtra={
                usdAfter != null && usdShown(COLLATERAL_SYMBOL, usdAfter, s.collAfter) ? (
                  <P
                    info={collUsdAtBlockProv(coords, { coll: ctx.collAfter, priceUsd: price as number, side: "after" })}
                  >
                    <ValuePill changed={collChanged}>{fmtUsd(usdAfter)}</ValuePill>
                  </P>
                ) : undefined
              }
            />
            {!collChanged && <StatSubline>unchanged</StatSubline>}
          </LedgerCell>

          <LedgerCell label="Debt" side="debt">
            <Transition
              before={debtBeforeStr}
              after={debtAfterStr}
              showBefore={!isOpen && debtChanged}
              closed={ends}
              symbol={DEBT_SYMBOL}
              provBefore={debtBeforeProv(coords)}
              provAfter={debtAfterProv(coords)}
              delta={
                <P info={debtDeltaProv(coords, { after: ctx.debtAfter, before: ctx.debtBefore })}>{debtDeltaStr}</P>
              }
            />
            {debtLines.length > 0 ? (
              <StatSubline changed>
                {debtLines.map((l, i) => (
                  <span key={i}>
                    {i > 0 && " · "}
                    {l}
                  </span>
                ))}
              </StatSubline>
            ) : !debtChanged ? (
              <StatSubline>unchanged</StatSubline>
            ) : null}
          </LedgerCell>

          <StatCard label="Collateral ratio">
            {crBeforeStr == null && crAfterStr == null ? (
              ends ? (
                <StateTransition>
                  <ClosedLabel />
                </StateTransition>
              ) : (
                <span className="text-sm font-semibold text-rb-500">{price == null ? "…" : "N/A"}</span>
              )
            ) : (
              <Transition
                before={crBeforeStr ?? ""}
                after={crAfterStr ?? ""}
                showBefore={crBeforeStr != null && crBeforeStr !== crAfterStr}
                closed={ends}
                provBefore={
                  price != null
                    ? ratioAtBlockProv(coords, {
                        coll: ctx.collBefore,
                        debt: ctx.debtBefore,
                        priceUsd: price,
                        side: "before",
                      })
                    : undefined
                }
                provAfter={
                  price != null
                    ? ratioAtBlockProv(coords, {
                        coll: ctx.collAfter,
                        debt: ctx.debtAfter,
                        priceUsd: price,
                        side: "after",
                      })
                    : undefined
                }
              />
            )}
            <StatSubline>minimum 110%</StatSubline>
          </StatCard>

          <StatCard label="ETH price">
            {price != null ? (
              <StateTransition>
                <P info={eventPriceProv(coords, price)}>
                  <span className="text-sm font-semibold tabular-nums text-rb-500">{fmtUsd(price)}</span>
                </P>
                <TokenChipIcon symbol={COLLATERAL_SYMBOL} size={16} />
              </StateTransition>
            ) : (
              <span className="text-sm font-semibold text-rb-500">…</span>
            )}
            <StatSubline>Liquity&apos;s price feed, at this block</StatSubline>
          </StatCard>
        </div>
      </div>

      {isRedemption && split && (
        <RedemptionOutcome ctx={ctx} coords={coords} split={split} surplus={surplus} currentPrice={currentPrice} />
      )}

      {forensics && <LiquidationForensics {...forensics} />}
      {isLiq && read?.liquidation ? (
        <LiquidationRoute read={read} coords={coords} surplusClaimed={surplus?.claimed ?? null} />
      ) : isLiq && readPending ? (
        <LiquidationRoutePending />
      ) : null}
    </>
  );
}

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs">
      <span className="text-rb-500">{label}</span>
      <span className="tabular-nums text-foreground">{children}</span>
    </div>
  );
}

function RedemptionOutcome({
  ctx,
  coords,
  split,
  surplus,
  currentPrice,
}: {
  ctx: LiquityV1Context;
  coords: LiquityV1Coords;
  split: NonNullable<ReturnType<typeof redemptionSplit>>;
  surplus: ReturnType<typeof useLiquityV1Surplus>;
  currentPrice?: number | null;
}) {
  const netAtRedemption = split.lusdRedeemed - split.ethToRedeemer * split.price;
  const netToday =
    currentPrice != null && currentPrice > 0 ? split.lusdRedeemed - split.ethToRedeemer * currentPrice : null;
  const legVals = { debt: String(split.lusdRedeemed), priceUsd: split.price, coll: ctx.collBefore };
  return (
    <div className="mx-5 my-2 space-y-1 rounded-xl bg-background px-4 py-3">
      <Row label="ETH to the redeemer">
        <P info={redemptionLegProv(coords, "redeemer", legVals)}>
          {fmtEth(split.ethToRedeemer)} {COLLATERAL_SYMBOL}
        </P>{" "}
        for {fmtLusd(split.lusdRedeemed)} {DEBT_SYMBOL}
      </Row>
      {split.full && (
        <Row label="ETH left to the owner (surplus pool)">
          <P info={redemptionLegProv(coords, "surplus", legVals)}>
            {fmtEth(surplus?.surplus ?? split.ethSurplus)} {COLLATERAL_SYMBOL}
          </P>
          {surplus && (
            <span className={surplus.claimed ? "text-rb-500" : "font-semibold text-green-600 dark:text-green-400"}>
              {" "}
              {surplus.claimed
                ? `claimed${surplus.claimed.timestamp != null ? ` ${formatDate(surplus.claimed.timestamp)}` : ""}`
                : surplus.claimable > EPS
                  ? "claimable"
                  : ""}
            </span>
          )}
        </Row>
      )}
      {split.full && (
        <Row label="Liquidation reserve">
          {fmtLusd(LIQUITY_V1_RESERVE)} {DEBT_SYMBOL} burned
        </Row>
      )}
      <Row label="Owner's net outcome">
        <P
          info={redemptionNetProv(coords, {
            debt: String(split.lusdRedeemed),
            eth: String(split.ethToRedeemer),
            priceUsd: split.price,
            when: "redemption",
          })}
        >
          {fmtUsdSigned(Math.abs(netAtRedemption) < 0.005 ? 0 : netAtRedemption)}
        </P>{" "}
        at the redemption price
        {netToday != null && (
          <>
            {" · "}
            <P
              info={redemptionNetProv(coords, {
                debt: String(split.lusdRedeemed),
                eth: String(split.ethToRedeemer),
                priceUsd: currentPrice as number,
                when: "today",
              })}
            >
              <span className={netToday >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}>
                {fmtUsdSigned(netToday)}
              </span>
            </P>{" "}
            at today&apos;s {fmtUsd(currentPrice as number)}
          </>
        )}
      </Row>
    </div>
  );
}

/** The "Where it went" block while the liquidation's receipt read is on its
 *  way: the heading and a placeholder for each row it will carry. */
function LiquidationRoutePending() {
  return (
    <div className="mx-5 my-2 space-y-1 rounded-xl bg-background px-4 py-3" aria-busy="true">
      <div className="mb-1 text-xs font-semibold text-rb-500">Where it went</div>
      {["Stability Pool", "Liquidator", "Owner"].map((label) => (
        <Row key={label} label={label}>
          <span className="inline-block h-3 w-28 animate-pulse rounded bg-rb-500/20 align-middle" />
        </Row>
      ))}
    </div>
  );
}

function LiquidationRoute({
  read,
  coords,
  surplusClaimed,
}: {
  read: LiquityV1EventRead;
  coords: LiquityV1Coords;
  surplusClaimed: { timestamp: number | null } | null;
}) {
  const l = read.liquidation!;
  const n = (s: string) => Number(s);
  return (
    <div className="mx-5 my-2 space-y-1 rounded-xl bg-background px-4 py-3">
      <div className="mb-1 text-xs font-semibold text-rb-500">
        Where it went{l.recoveryMode ? " · Recovery Mode liquidation" : ""}
        {l.trovesInTx > 1 ? ` · this transaction liquidated ${l.trovesInTx} Troves; the figures are its totals` : ""}
      </div>
      {n(l.stabilityPoolDebt) > EPS && (
        <Row label="Stability Pool">
          burned <P info={liqRouteProv(coords, "stability pool debt")}>{fmtLusd(n(l.stabilityPoolDebt))}</P>{" "}
          {DEBT_SYMBOL}, received{" "}
          <P info={liqRouteProv(coords, "stability pool eth")}>{fmtEth(n(l.stabilityPoolEth))}</P> {COLLATERAL_SYMBOL}
        </Row>
      )}
      {(n(l.redistributedDebt) > EPS || n(l.redistributedEth) > EPS) && (
        <Row label="Shared out to other Troves">
          <P info={liqRouteProv(coords, "redistributed")}>
            {fmtLusd(n(l.redistributedDebt))} {DEBT_SYMBOL} and {fmtEth(n(l.redistributedEth))} {COLLATERAL_SYMBOL}
          </P>
        </Row>
      )}
      <Row label={<>Liquidator {l.liquidator && <LinkedAddress address={l.liquidator} className="text-rb-500" />}</>}>
        <P info={liqRouteProv(coords, "liquidator")}>
          {fmtLusd(n(l.liquidatorLusd))} {DEBT_SYMBOL} + {fmtEth(n(l.liquidatorEth))} {COLLATERAL_SYMBOL}
        </P>
      </Row>
      {n(l.surplusEth) > EPS && (
        <Row label="Left to the owner (surplus pool)">
          <P info={liqRouteProv(coords, "surplus")}>
            {fmtEth(n(l.surplusEth))} {COLLATERAL_SYMBOL}
          </P>
          {surplusClaimed ? " claimed" : " claimable"}
        </Row>
      )}
      <Row label="Owner">receives nothing back; keeps the LUSD borrowed</Row>
    </div>
  );
}
