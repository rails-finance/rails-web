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

import { Fragment } from "react";
import { collAmount, usdPrice } from "@/lib/makerdao/price-format";
import { OpenPositionStats } from "@/components/shared/open-position-stats";
import { ClosedPositionStats } from "@/components/shared/closed-position-stats";
import { PositionCardMeta } from "@/components/shared/position-card-meta";
import { StatValue, StatFootnote, StatDash } from "@/components/shared/stat-value";
import { AssetAmount } from "@/components/shared/asset-amount";
import { Prov } from "@/components/shared/provenance";
import { PositionCardShell } from "@/components/shared/position-card-shell";
import { PositionCardDetail } from "@/components/shared/position-card-disclosure";
import { WalletPill } from "@/components/shared/wallet-pill";
import { RevealTip } from "@/components/shared/reveal-tip";
import {
  vaultInkProv,
  vaultArtProv,
  daiDebtProv,
  collateralUsdProv,
  collateralRatioProv,
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
  /** A capped price feed (LockStake): the governance cap and the OSM price
   *  behind it; priceUsd is the lower. */
  priceCap?: { capUsd: number; oracleUsd: number | null } | null;
  /** The ilk's auction terms: Clipper breaker (0 run; 1–3 new auctions
   *  refused) and the penalty multiplier. */
  auction?: { stopped: number; chop: number } | null;
  /** A LockStake urn's engine settings. */
  lockstake?: { exitFee: number; farm: string | null; voteDelegate: string | null } | null;
  /** LockStake Engine urn (decision 0013): cdp-less — the urn address is the
   *  identity — with SKY collateral and USDS debt. */
  lse?: boolean;
  /** DAI drawn, net of repayments, since the vault last owed nothing
   *  (lib/makerdao/vault-history.tsx); the debt less this is the stability fee
   *  in it, which the Explanation states. Null where that start is not loaded.
   *  Set by the detail page. */
  drawnDai?: number | null;
}

const BORROWING_TIP = "Open, with debt drawn against the collateral. The vault list marks it OPEN.";
const COLLATERAL_ONLY_TIP = "Open, holding collateral with no debt. The vault list marks it OPEN.";
const URN_TIP =
  "The vault's address in the Vat, Maker's core accounting contract. This vault has no vault number, so it is named by that address.";
const LOCKSTAKE_TIP =
  "A vault in Sky's LockStake Engine: SKY locked as collateral against USDS. The engine opens it without the CDP manager, so it has no vault number.";
const DIRECT_TIP =
  "Opened on the Vat, Maker's core accounting contract, without the CDP manager, so it has no vault number; its address is its owner.";

/** The capped feed in one sentence (lib/sources/chain/makerdao-lse-oracle.ts). */
const capTip = (v: MakerVaultView): string =>
  `Governance caps the price Maker uses for ${v.ilk} at ${usdPrice(v.priceCap!.capUsd)}` +
  (v.priceCap!.oracleUsd != null
    ? `; the oracle reads ${v.collateralSymbol} at ${usdPrice(v.priceCap!.oracleUsd)}, so the vault is valued at the cap.`
    : ".");

/** The Clipper's breaker in one sentence. */
const auctionsOffTip = (v: MakerVaultView): string =>
  `Governance has switched ${v.ilk}'s auctions off: its auction contract refuses new auctions` +
  `${(v.auction?.stopped ?? 0) >= 3 ? " and bids" : ""}, so for now a vault under the minimum is not sold.`;

/** The vault's number-or-address identity: CdpManager vaults have the friendly
 *  cdp id; LockStake urns and direct-Vat urns have only their urn address
 *  (there is no global LSE ordinal — Open.index is owner-scoped). */
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
  positionSummary,
  riskDetail,
}: {
  v: MakerVaultView;
  receipts?: boolean;
  /** Opt in to the closed/opened card (ui-jobs 209), keyed per vault —
   *  forwarded to `PositionCardShell`. Closed, the card is its header and
   *  three headlines; opened, each headline's detail. */
  positionSummary?: boolean;
  /** Opened-layer lines under Collateral ratio from the page's live overlay
   *  (the price bar, the room to the minimum). Only drawn on a disclosing card. */
  riskDetail?: React.ReactNode;
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
  // A capped feed valued at its cap: the oracle reads above it.
  const capBinds = v.priceCap != null && v.priceCap.oracleUsd != null && v.priceCap.oracleUsd > v.priceCap.capUsd;
  // The closed/opened card (ui-jobs 209): every line under a headline moves
  // into the opened layer (<PositionCardDetail>).
  const disclosing = receipts && !!positionSummary;
  const Detail = disclosing ? PositionCardDetail : Fragment;

  // Closed / liquidated: ink and art have settled to 0, so the headline is what
  // the vault held at its height — highest recorded collateral + DAI debt (the
  // MAX of the per-event balances, each event's art repriced at its own historic
  // rate). DAI is measured at recorded on-chain events, so between-event fee
  // accrual is not reflected.
  if (v.status === "closed" || v.status === "liquidated") {
    const identity = (
      <span className="flex items-center gap-2 text-xs font-semibold text-rb-500">
        {receipts ? null : v.owner ? (
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
        positionSummary={positionSummary}
      >
        <ClosedPositionStats
          // A disclosing card's closed layer is the header and the outcome;
          // the highest recorded balances are its opened layer.
          detailGate={disclosing ? PositionCardDetail : undefined}
          outcome={v.status}
          badgeTip={
            v.status === "liquidated"
              ? "A liquidation emptied this vault. It still belongs to its owner and can take a new deposit."
              : "This vault owes nothing and its collateral has been taken out. It still belongs to its owner and can take a new deposit."
          }
          leadingIdentity={identity}
          closedAt={v.lastActivityAt ?? undefined}
          identity={
            <PositionCardMeta
              lastActivityAt={v.lastActivityAt}
              eventCount={v.txCount}
              eventTotal={v.eventCount}
              liquidated={v.everLiquidated}
            />
          }
          labelTips={{
            collateral: "The most collateral the vault held at any of its events.",
            debt: "The most the vault owed at any of its events, stability fee accrued to that event included.",
            outcome: "How the vault's history ended: closed by its owner, or liquidated.",
          }}
          collateral={
            v.peakInk > 0 ? (
              <StatValue>
                <Prov info={peakInkProv(v.collateralSymbol, { ilk: v.ilk })}>
                  <AssetAmount value={v.peakInk} symbol={v.collateralSymbol} display={collAmount(v.peakInk)} />
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
              <StatFootnote>the most it owed at any event, fee included</StatFootnote>
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
      positionSummary={positionSummary}
    >
      <OpenPositionStats
        stackOnPhone={disclosing}
        // Detail render (receipts): the V4 spoke-card header grammar — a
        // neutral mode-word pill (what the vault is doing NOW, not a lifecycle
        // word). The LISTING render keeps the lifecycle pill; the owner wallet
        // pill (facehash + copy + bookmark) renders on both surfaces.
        statusPill={
          receipts ? (
            <RevealTip
              tip={(v.debtDai ?? 0) > 0 ? BORROWING_TIP : COLLATERAL_ONLY_TIP}
              label={`${(v.debtDai ?? 0) > 0 ? "Borrowing" : "Collateral only"}: ${(v.debtDai ?? 0) > 0 ? BORROWING_TIP : COLLATERAL_ONLY_TIP}`}
              focusable
              className="focus-ring rounded-sm"
            >
              <span className="font-bold px-2 py-0.5 rounded-sm text-xs bg-rb-300 dark:bg-rb-700 text-foreground/80 dark:text-foreground/60">
                {(v.debtDai ?? 0) > 0 ? "Borrowing" : "Collateral only"}
              </span>
            </RevealTip>
          ) : (
            <LifecyclePill status={v.status} />
          )
        }
        // The owner pill leads, with the ilk + vault id alongside; the owner
        // pill's buttons (not anchors) live safely inside the listing card's <Link>.
        leadingIdentity={
          <span className="flex items-center gap-2 text-xs font-semibold text-rb-500">
            {receipts ? null : v.owner ? (
              <WalletPill wallet={v.owner} ensName={null} filterProtocol="makerdao" bookmarkProtocol="makerdao" />
            ) : (
              <span className="font-normal tabular-nums text-rb-400">—</span>
            )}
            <span>
              {v.ilk}
              <span className="ml-2 font-normal tabular-nums text-rb-400">
                {v.cdpId == null ? (
                  <RevealTip tip={URN_TIP} label={`${vaultIdentityLabel(v)}: ${URN_TIP}`} focusable>
                    <span className="underline decoration-dotted decoration-rb-400 underline-offset-2">
                      {vaultIdentityLabel(v)}
                    </span>
                  </RevealTip>
                ) : (
                  vaultIdentityLabel(v)
                )}
              </span>
            </span>
            {v.lse ? (
              // Neutral origin marking (the give/era grammar's register): this
              // vault lives in the Sky LockStake Engine, not the CdpManager.
              <RevealTip tip={LOCKSTAKE_TIP} label={`LockStake: ${LOCKSTAKE_TIP}`} focusable>
                <span className="rounded-sm bg-rb-300 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-foreground/60 dark:bg-rb-700">
                  LockStake
                </span>
              </RevealTip>
            ) : v.cdpId == null ? (
              // Same marking for a urn opened on the Vat with no manager: its
              // owner is the urn, often a contract.
              <RevealTip tip={DIRECT_TIP} label={`Direct: ${DIRECT_TIP}`} focusable>
                <span className="rounded-sm bg-rb-300 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-foreground/60 dark:bg-rb-700">
                  Direct
                </span>
              </RevealTip>
            ) : null}
          </span>
        }
        // Right-hand activity-meta cluster: time-ago + own-tx count +
        // liquidation flag (the roster grammar; the count is distinct own
        // transactions, per the chip title's claim).
        identity={
          <PositionCardMeta
            lastActivityAt={v.lastActivityAt}
            eventCount={v.txCount}
            eventTotal={v.eventCount}
            liquidated={v.everLiquidated}
          />
        }
        columns={[
          {
            label: CARD_VOCAB.collateral,
            labelTip: v.priceCap
              ? `The ${v.collateralSymbol} locked in the vault, valued at Maker's price: the oracle's, capped by governance.`
              : `The ${v.collateralSymbol} locked in the vault, valued at Maker's oracle price.`,
            value: (
              <StatValue>
                <Prov info={vaultInkProv(v.collateralSymbol, v.atBlock, false, v.source)}>
                  <AssetAmount value={v.ink} symbol={v.collateralSymbol} />
                </Prov>
              </StatValue>
            ),
            footnote:
              v.collateralUsd != null ? (
                <Detail>
                  <StatFootnote>
                    <Prov info={collateralUsdProv(v.collateralSymbol, formatNumber(v.ink), v.priceUsd ?? 0)}>
                      {formatUsd(v.collateralUsd)}
                    </Prov>
                    {capBinds && v.priceCap ? (
                      // The feed is capped under the oracle, so the value is at
                      // the cap (TO-DO-ui-jobs 189).
                      <>
                        {" "}
                        <RevealTip
                          tip={capTip(v)}
                          label={`Capped price: ${capTip(v)}`}
                          focusable
                          className="focus-ring rounded-sm"
                        >
                          <span className="underline decoration-dotted decoration-rb-400 underline-offset-2">
                            at the {usdPrice(v.priceCap.capUsd)} cap
                          </span>
                        </RevealTip>
                      </>
                    ) : null}
                  </StatFootnote>
                </Detail>
              ) : undefined,
          },
          {
            label: CARD_VOCAB.debt,
            labelTip: `The ${debtSym} the vault owes: what it drew plus the stability fee added since.`,
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
            // The ilk's live stability fee. The fee already in the debt is
            // the Explanation's and the flows panel's to state.
            footnote:
              v.stabilityFeeApr != null ? (
                <Detail>
                  <StatFootnote>
                    <Prov info={stabilityFeeAprProv(v.ilk)}>{(v.stabilityFeeApr * 100).toFixed(2)}%</Prov> stability fee
                  </StatFootnote>
                </Detail>
              ) : undefined,
          },
          {
            label: ratioLabel("cdp"),
            labelTip:
              "The collateral's value divided by the debt. Below the collateral type's minimum the vault can be liquidated.",
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
            footnote: (
              <Detail>
                {v.liquidationPriceUsd != null && v.liquidationPriceUsd > 0 ? (
                  <StatFootnote>
                    Liquidates at{" "}
                    <Prov
                      info={liquidationPriceProv(
                        v.debtDai != null ? `${formatNumber(v.debtDai)} ${debtSym}` : "—",
                        v.matRatio != null ? `${(v.matRatio * 100).toFixed(0)}%` : "—",
                        `${formatNumber(v.ink)} ${v.collateralSymbol}`,
                      )}
                    >
                      {usdPrice(v.liquidationPriceUsd, formatUsd)}
                    </Prov>
                    {v.auction != null && v.auction.stopped > 0 ? (
                      // The breaker is on: a vault under the minimum is not
                      // sold while it stands (TO-DO-ui-jobs 189).
                      <>
                        {" · "}
                        <RevealTip
                          tip={auctionsOffTip(v)}
                          label={`Auctions off: ${auctionsOffTip(v)}`}
                          focusable
                          className="focus-ring rounded-sm"
                        >
                          <span className="underline decoration-dotted decoration-rb-400 underline-offset-2">
                            auctions off
                          </span>
                        </RevealTip>
                      </>
                    ) : null}
                  </StatFootnote>
                ) : null}
                {disclosing && riskDetail}
              </Detail>
            ),
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
