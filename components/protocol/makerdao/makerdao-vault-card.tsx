"use client";

// MakerDAO vault position card — the chain-state analog of the Aave V4 / Liquity
// position cards, rendered through the SAME shared grammar (OpenPositionStats +
// StatValue) so it lines up byte-for-byte with the other explorers.
//
// Every headline value is the on-chain record: collateral (ink) and normalized debt
// (art) are Vat slots — read live via eth_call on the detail page, or
// reconstructed by replay on the listing; both reconcile at T. DAI debt is the §2
// art × rate multiply and USD is the §3 ink × OSM-price overlay — arithmetic over
// on-chain inputs (chain-derived). The collateral RATIO — (ink × price) / (art ×
// rate) — is more steps out, but EVERY leaf is still on-chain: ink/art/rate are
// Vat slots and the price is Maker's own OSM (Spotter) oracle, NOT an off-chain
// feed. What makes a value chain-state is on-chain provenance, not a step count
// (view-tiers.md), so the ratio classifies as `chain-derived`. (Only an off-chain
// leaf — a DefiLlama price, a projection — would push it out; cf. Compound's
// parked USD.)

import { OpenPositionStats } from "@/components/shared/open-position-stats";
import { ClosedPositionStats } from "@/components/shared/closed-position-stats";
import { PositionCardMeta } from "@/components/shared/position-card-meta";
import { StatValue, StatFootnote, StatDash } from "@/components/shared/stat-value";
import { AssetAmount } from "@/components/shared/asset-amount";
import { Prov } from "@/components/shared/provenance";
import { PositionCardShell } from "@/components/shared/position-card-shell";
import { WalletPill } from "@/components/shared/wallet-pill";
import {
  vaultInkProv,
  vaultArtProv,
  daiDebtProv,
  collateralUsdProv,
  collateralRatioProv,
  stabilityFeeProv,
  stabilityFeeAprProv,
  liquidationPriceProv,
  peakInkProv,
  peakDebtProv,
} from "@/lib/makerdao/event-provenance";
import { formatNumber } from "@/lib/utils/format";
import { formatUsd } from "@/lib/shared/format-event";
import { ilkDebtSymbol } from "@/lib/makerdao/asset-catalog";
import { makerdaoPositionContent } from "@/lib/makerdao/position-content";
import { CARD_VOCAB, ratioLabel } from "@/lib/shared/card-vocab";
import { LifecyclePill } from "@/components/shared/position-card-pills";

export interface MakerVaultView {
  cdpId: string | null;
  urn: string;
  ilk: string;
  collateralSymbol: string;
  owner: string | null;
  status: "open" | "closed" | "liquidated";
  ink: number;
  art: number;
  rate: string | null;
  debtDai: number | null;
  priceUsd: number | null;
  collateralUsd: number | null;
  /** Highest recorded collateral (ink) + DAI debt over the vault's life — shown on
   *  closed/liquidated cards where the live ink/art have settled to 0. */
  peakInk: number;
  peakDebtDai: number | null;
  /** Activity-meta. txCount = distinct transactions of the vault's OWN record
   *  (grab seizures and lse-* auction markers excluded — what the chip's title
   *  claims); eventCount keeps the raw MV row count for surfaces that speak in
   *  events; lastActivityAt = unix seconds of the most recent event (doubles
   *  as the closure date on terminal cards). */
  eventCount: number;
  txCount: number;
  lastActivityAt: number | null;
  everLiquidated: boolean;
  // Whether this view's ink/art came from a live eth_call ("chain") or the replay
  // summary ("api") — a primary-truth data field, NOT the retired user toggle.
  source: "api" | "chain";
  atBlock?: number;
  // Live-overlay-only fields (present when source === "chain"; the replay
  // summary can't supply them, and the risk surfaces decline to render rather
  // than degrade to a wrong value).
  /** Liquidation ratio as a multiplier (1.45 = 145%) — Spotter mat. */
  matRatio?: number | null;
  /** Price at which the Vat safety line is crossed = debtDai × mat ÷ ink. */
  liquidationPriceUsd?: number | null;
  /** Live stability fee APR from Jug base + duty. */
  stabilityFeeApr?: number | null;
  /** The ilk's minimum vault debt (dust, DAI). */
  dustDai?: number | null;
  /** The ilk's debt ceiling (line, DAI). */
  lineDai?: number | null;
  /** The ilk's total drawn debt (Art × rate, DAI). */
  ilkDebtDai?: number | null;
  /** LockStake Engine urn (decision 0013): cdp-less — the urn address is the
   *  identity — with SKY collateral and USDS debt. */
  lse?: boolean;
}

/** The vault's number-or-address identity: CdpManager vaults have the friendly
 *  cdp id; LockStake urns have only their urn address (there is no global LSE
 *  ordinal — Open.index is owner-scoped). */
function vaultIdentityLabel(v: MakerVaultView): string {
  if (v.cdpId != null) return `Vault #${v.cdpId}`;
  return `Urn ${v.urn.slice(0, 6)}…${v.urn.slice(-4)}`;
}

export function MakerVaultCard({
  v,
  receipts = false,
  rowExtra,
  explanation,
  viewHref,
}: {
  v: MakerVaultView;
  receipts?: boolean;
  /** Context content riding the shell's heading-button row (the detail page
   *  passes the compact liquidation runway). */
  rowExtra?: React.ReactNode;
  /** The card's Explanation section (the V4/trove "About this position" home) —
   *  narration bullets + the risk strips describing the vault NOW. */
  explanation?: React.ReactNode;
  /** Copy-this-view control, forwarded straight through to `PositionCardShell` —
   *  the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
}) {
  const artHuman = formatNumber(v.art);
  // DAI for CdpManager vaults, USDS for LockStake urns — same Vat accounting,
  // different join mints the token (asset-catalog).
  const debtSym = ilkDebtSymbol(v.ilk);
  const ratio = v.debtDai && v.collateralUsd != null && v.debtDai > 0 ? (v.collateralUsd / v.debtDai) * 100 : null;
  // Accrued stability fee = current DAI debt − normalized art. Both Vat reads,
  // so the caption is read from the chain; suppressed at dust magnitudes.
  const accruedFee = v.debtDai != null ? Math.max(0, v.debtDai - v.art) : 0;

  // Closed / liquidated: ink and art have settled to 0, so the headline is what
  // the vault held at its height — highest recorded collateral + DAI debt (the
  // MAX of the per-event balances, each event's art repriced at its own historic
  // rate). DAI is measured at recorded on-chain events, so between-event fee
  // accrual is not reflected.
  if (v.status === "closed" || v.status === "liquidated") {
    const identity = (
      <span className="flex items-center gap-2 text-xs font-semibold text-rb-500">
        {v.owner ? (
          <WalletPill wallet={v.owner} ensName={null} filterProtocol="makerdao" bookmarkProtocol="makerdao" />
        ) : (
          <span className="font-normal tabular-nums text-rb-400">—</span>
        )}
        <span>
          {v.ilk}
          <span className="ml-2 font-normal tabular-nums text-rb-400">{vaultIdentityLabel(v)}</span>
        </span>
      </span>
    );
    return (
      // The shell threads the heading-button row and the Explanation section on
      // terminal cards too — a closed vault gets its receipts pane and its
      // prose exactly like an open one (the props used to stop here). rowExtra
      // deliberately does not ride here — the live risk strips describe the
      // chain NOW and never a past life's card.
      <PositionCardShell
        receipts={receipts}
        explanation={explanation}
        viewHref={viewHref}
        learnMore={makerdaoPositionContent({ status: v.status, ilk: v.ilk, debtSymbol: debtSym, lse: v.lse })}
      >
        <ClosedPositionStats
          outcome={v.status}
          leadingIdentity={identity}
          closedAt={v.lastActivityAt ?? undefined}
          identity={
            <PositionCardMeta lastActivityAt={v.lastActivityAt} eventCount={v.txCount} liquidated={v.everLiquidated} />
          }
          collateral={
            v.peakInk > 0 ? (
              <StatValue>
                <Prov info={peakInkProv(v.collateralSymbol, { ilk: v.ilk })}>
                  <AssetAmount value={v.peakInk} symbol={v.collateralSymbol} />
                </Prov>
              </StatValue>
            ) : (
              <StatDash />
            )
          }
          debt={
            v.peakDebtDai != null && v.peakDebtDai > 0 ? (
              <StatValue>
                <Prov info={peakDebtProv(debtSym, { ilk: v.ilk })}>
                  <AssetAmount value={v.peakDebtDai} symbol={debtSym} />
                </Prov>
              </StatValue>
            ) : (
              <StatDash />
            )
          }
          debtFootnote={
            v.peakDebtDai != null && v.peakDebtDai > 0 ? (
              <StatFootnote>art × rate, at recorded events</StatFootnote>
            ) : undefined
          }
        />
      </PositionCardShell>
    );
  }

  return (
    <PositionCardShell
      receipts={receipts}
      rowExtra={rowExtra}
      explanation={explanation}
      viewHref={viewHref}
      learnMore={makerdaoPositionContent({ status: v.status, ilk: v.ilk, debtSymbol: debtSym, lse: v.lse })}
    >
      <OpenPositionStats
        // Detail render (receipts): the V4 spoke-card header grammar — a
        // neutral mode-word pill (what the vault is doing NOW, not a lifecycle
        // word). The LISTING render keeps the lifecycle pill; the owner wallet
        // pill (facehash + copy + bookmark) renders on both surfaces.
        statusPill={
          receipts ? (
            <span className="font-bold px-2 py-0.5 rounded-sm text-xs bg-rb-300 dark:bg-rb-700 text-foreground/80 dark:text-foreground/60">
              {(v.debtDai ?? 0) > 0 ? "Borrowing" : "Collateral only"}
            </span>
          ) : (
            <LifecyclePill status={v.status} />
          )
        }
        // The owner pill leads, with the ilk + vault id alongside; the owner
        // pill's buttons (not anchors) live safely inside the listing card's <Link>.
        leadingIdentity={
          <span className="flex items-center gap-2 text-xs font-semibold text-rb-500">
            {v.owner ? (
              <WalletPill wallet={v.owner} ensName={null} filterProtocol="makerdao" bookmarkProtocol="makerdao" />
            ) : (
              <span className="font-normal tabular-nums text-rb-400">—</span>
            )}
            <span>
              {v.ilk}
              <span className="ml-2 font-normal tabular-nums text-rb-400">{vaultIdentityLabel(v)}</span>
            </span>
            {v.lse ? (
              // Neutral origin marking (the give/era grammar's register): this
              // vault lives in the Sky LockStake Engine, not the CdpManager.
              <span className="rounded-sm bg-rb-300 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-foreground/60 dark:bg-rb-700">
                LockStake
              </span>
            ) : null}
          </span>
        }
        // Right-hand activity-meta cluster: time-ago + own-tx count +
        // liquidation flag (the roster grammar; the count is distinct own
        // transactions, per the chip title's claim).
        identity={
          <PositionCardMeta lastActivityAt={v.lastActivityAt} eventCount={v.txCount} liquidated={v.everLiquidated} />
        }
        columns={[
          {
            label: CARD_VOCAB.collateral,
            value: (
              <StatValue>
                <Prov info={vaultInkProv(v.collateralSymbol, v.atBlock, false, v.source)}>
                  <AssetAmount value={v.ink} symbol={v.collateralSymbol} />
                </Prov>
              </StatValue>
            ),
            footnote:
              v.collateralUsd != null ? (
                <StatFootnote>
                  <Prov info={collateralUsdProv(v.collateralSymbol, formatNumber(v.ink), v.priceUsd ?? 0)}>
                    {formatUsd(v.collateralUsd)}
                  </Prov>
                </StatFootnote>
              ) : undefined,
          },
          {
            label: CARD_VOCAB.debt,
            value:
              v.debtDai != null && v.rate ? (
                <StatValue>
                  <Prov info={daiDebtProv(artHuman, v.rate, debtSym)}>
                    <AssetAmount value={v.debtDai} symbol={debtSym} />
                  </Prov>
                </StatValue>
              ) : (
                <StatValue>
                  <Prov info={vaultArtProv(v.atBlock, false, v.source)}>{artHuman} art</Prov>
                </StatValue>
              ),
            // Captions (the V4 stat-caption grammar): the accrued fee carried
            // in the DAI figure + the ilk's live stability fee. Both live-
            // overlay facts; absent on the replay-only render.
            footnote: (
              <StatFootnote>
                art {artHuman}
                {accruedFee > 0.005 && v.rate != null ? (
                  <>
                    {" · incl. "}
                    <Prov info={stabilityFeeProv(artHuman, v.rate)}>
                      {formatNumber(accruedFee)} {debtSym}
                    </Prov>{" "}
                    fee
                  </>
                ) : null}
                {v.stabilityFeeApr != null ? (
                  <>
                    {" · "}
                    <Prov info={stabilityFeeAprProv(v.ilk)}>{(v.stabilityFeeApr * 100).toFixed(2)}%</Prov> stability fee
                  </>
                ) : null}
              </StatFootnote>
            ),
          },
          {
            label: ratioLabel("cdp"),
            value:
              ratio != null ? (
                <StatValue>
                  <Prov
                    info={collateralRatioProv(
                      v.collateralUsd != null ? formatUsd(v.collateralUsd) : "—",
                      v.debtDai != null ? `${formatNumber(v.debtDai)} ${debtSym}` : "—",
                    )}
                  >
                    {ratio.toFixed(0)}%
                  </Prov>
                </StatValue>
              ) : (
                <StatDash />
              ),
            // Liquidates-at caption (single-collateral anchor — a vault has
            // exactly one ilk, so the price form is always meaningful).
            footnote:
              v.liquidationPriceUsd != null && v.liquidationPriceUsd > 0 ? (
                <StatFootnote>
                  Liquidates at{" "}
                  <Prov
                    info={liquidationPriceProv(
                      v.debtDai != null ? `${formatNumber(v.debtDai)} ${debtSym}` : "—",
                      v.matRatio != null ? `${(v.matRatio * 100).toFixed(0)}%` : "—",
                      `${formatNumber(v.ink)} ${v.collateralSymbol}`,
                    )}
                  >
                    {formatUsd(v.liquidationPriceUsd)}
                  </Prov>
                </StatFootnote>
              ) : undefined,
          },
        ]}
      />
    </PositionCardShell>
  );
}

/** Build a card view from a listing row (MakerVaultSummary, the api builder's presentation shape). */
import type { MakerVaultSummary } from "@/lib/sources/api/makerdao-vaults";
export function viewFromSummary(s: MakerVaultSummary): MakerVaultView {
  return {
    cdpId: s.cdpId,
    urn: s.urn,
    ilk: s.ilk,
    collateralSymbol: s.collateralSymbol,
    owner: s.owner,
    status: s.status,
    ink: s.collateral.amount,
    art: Number(s.debt.artRaw) / 1e18,
    rate: s.ilkState.rate,
    debtDai: s.debt.dai,
    priceUsd: s.ilkState.priceUsd,
    collateralUsd: s.collateral.valueUsd,
    peakInk: s.peak.collateral,
    peakDebtDai: s.peak.debtDai,
    eventCount: s.activity.eventCount,
    txCount: s.activity.txCount,
    lastActivityAt: s.activity.lastEventAt,
    everLiquidated: s.everLiquidated,
    source: "api",
    lse: s.lse,
  };
}
