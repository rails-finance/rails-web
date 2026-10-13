"use client";

// MakerDAO vault position card: a slot builder for the shared position card
// (components/shared/position-card.tsx). `makerVaultCardSlots` turns the
// vault's view and the page's live overlay into one `PositionCardSlots`; the
// shell draws the frame, the tag, the ⋮, the headlines, the panel, the (i) and
// the counters (rails-ops TO-DO-position-card 322).
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

import { type ReactNode, useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import {
  PositionCard,
  type PositionCardExports,
  type PositionCardHead,
  type PositionCardMenu,
  type PositionCardOutcome,
  type PositionCardSlots,
  type PositionCardStatus,
} from "@/components/shared/position-card";
import { ToolsMenuItem } from "@/components/shared/tools-menu";
import { collAmount, usdPrice } from "@/lib/makerdao/price-format";
import { AssetAmount } from "@/components/shared/asset-amount";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { WalletPill } from "@/components/shared/wallet-pill";
import { RevealTip } from "@/components/shared/reveal-tip";
import {
  vaultInkProv,
  vaultArtProv,
  daiDebtProv,
  collateralUsdProv,
  collateralRatioProv,
  peakInkProv,
  peakDebtProv,
} from "@/lib/makerdao/event-provenance";
import { formatNumber } from "@/lib/utils/format";
import { formatUsd } from "@/lib/shared/format-event";
import { ilkDebtSymbol } from "@/lib/makerdao/asset-catalog";
import { makerPositionModal } from "@/lib/makerdao/event-templates";
import { CARD_VOCAB, ratioLabel } from "@/lib/shared/card-vocab";
import { makerdaoPanelColumns } from "./makerdao-risk-slot";

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

/** The vault's number-or-address identity: CdpManager vaults have the friendly
 *  cdp id; LockStake urns and direct-Vat urns have only their urn address
 *  (there is no global LSE ordinal — Open.index is owner-scoped). */
function vaultIdentityLabel(v: MakerVaultView): string {
  if (v.cdpId != null) return `Vault #${v.cdpId}`;
  return `Urn ${v.urn.slice(0, 6)}…${v.urn.slice(-4)}`;
}

/** The debt's dollar value at Maker's $1 par. */
function debtUsdProv(symbol: string, debt: number): Provenance {
  return {
    kind: "derived",
    summary: `Debt value in USD: the ${symbol} debt at Maker's $1 par. The Vat counts one ${symbol} as one dollar, and the card states no market price for it.`,
    formula: "debt × $1",
    inputs: [
      { label: "debt", value: `${formatNumber(debt)} ${symbol}`, kind: "chain-derived", pclass: "state" },
      { label: "par", value: "$1", kind: "derived", note: `Maker accounts ${symbol} at $1` },
    ],
  };
}

const chipClass =
  "rounded-sm bg-rb-300 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-foreground/60 dark:bg-rb-700";

/** A neutral chip with its tip. */
function KindChip({ word, tip }: { word: string; tip: string }) {
  return (
    <RevealTip tip={tip} label={`${word}: ${tip}`} focusable>
      <span className={chipClass}>{word}</span>
    </RevealTip>
  );
}

/** What kind of vault this is, where it is not a plain CdpManager vault with
 *  a number: a urn named by its address, a LockStake engine urn, or a urn
 *  opened on the Vat with no manager. */
function VaultKindChips({ v, urn = true }: { v: MakerVaultView; urn?: boolean }) {
  if (v.cdpId != null && !v.lse) return null;
  return (
    <>
      {urn && v.cdpId == null && <KindChip word="Urn" tip={URN_TIP} />}
      {v.lse ? (
        <KindChip word="LockStake" tip={LOCKSTAKE_TIP} />
      ) : v.cdpId == null ? (
        <KindChip word="Direct" tip={DIRECT_TIP} />
      ) : null}
    </>
  );
}

/** The vault's number or address on the card's ⋮ with a copy, and the link to
 *  this position. */
function MakerMenuRows({ v }: { v: MakerVaultView }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (key: string, value: string) => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  };
  const id = v.cdpId ?? v.urn;
  return (
    <>
      <ToolsMenuItem
        icon={copied === "id" ? <Check size={16} /> : <Copy size={16} />}
        title={vaultIdentityLabel(v)}
        subtitle={copied === "id" ? "Copied" : v.cdpId != null ? "Copy the vault number" : "Copy the urn address"}
        onClick={() => copy("id", id)}
      />
      <ToolsMenuItem
        icon={copied === "link" ? <Check size={16} /> : <Link2 size={16} className="-rotate-45" />}
        title="Link to this position"
        subtitle={copied === "link" ? "Copied" : "Copy the page's address"}
        onClick={() => copy("link", `${window.location.origin}/ethereum/makerdao/${id}`)}
      />
    </>
  );
}

/** What a Maker vault page or listing hands the card. */
export interface MakerVaultCardProps {
  v: MakerVaultView;
  /** `detail` on the vault's page (receipts, panel, (i)); `listing` in a row. */
  surface?: "detail" | "listing";
  /** The card's Explanation section (the V4/trove "About this position" home):
   *  narration bullets describing the vault NOW. */
  explanation?: ReactNode;
  /** The pane's copy-this-view link: the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
  /** The ⋮'s export shapes (`makerdaoExports`). Absent: the ⋮ holds the
   *  vault's rows and the provenance row alone. */
  exports?: PositionCardExports;
}

/** The Maker vault's slots for the shared position card. */
export function makerVaultCardSlots({
  v,
  surface = "listing",
  explanation,
  viewHref,
  exports,
}: MakerVaultCardProps): PositionCardSlots {
  const detail = surface === "detail";
  const artHuman = formatNumber(v.art);
  // DAI for CdpManager vaults, USDS for LockStake urns — same Vat accounting,
  // different join mints the token (asset-catalog).
  const debtSym = ilkDebtSymbol(v.ilk);
  const ratio = v.debtDai && v.collateralUsd != null && v.debtDai > 0 ? (v.collateralUsd / v.debtDai) * 100 : null;
  // A capped feed valued at its cap: the oracle reads above it.
  const capBinds = v.priceCap != null && v.priceCap.oracleUsd != null && v.priceCap.oracleUsd > v.priceCap.capUsd;

  const status: PositionCardStatus | null =
    v.status === "liquidated"
      ? { word: "Liquidated", tone: "danger" }
      : v.status === "closed"
        ? { word: "Closed", tone: "muted" }
        : null;

  const counters = {
    lastActivityAt: v.lastActivityAt,
    eventCount: v.txCount,
    eventTotal: v.eventCount,
    liquidated: v.everLiquidated,
    // The foot strip reads transactions, warnings, then the age.
    ...(detail ? { order: "age-last" as const } : {}),
  };

  // The vault's kind labels the card. The listing adds the owner and the
  // vault's number; the detail page names the owner in its wallet row and the
  // number in the ⋮.
  const identity = detail ? (
    <span className="flex items-center gap-2 text-xs font-semibold text-rb-500">
      {v.ilk}
      <VaultKindChips v={v} />
    </span>
  ) : (
    <span className="flex items-center gap-2 text-xs font-semibold text-rb-500">
      {v.owner ? (
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
      <VaultKindChips v={v} urn={false} />
    </span>
  );

  const common = { status, identity, counters };
  const menu: PositionCardMenu = {
    leading: () => <MakerMenuRows v={v} />,
    exports: exports ?? null,
  };
  const detailCommon = {
    surface: "detail" as const,
    explainer: { body: explanation ?? null, viewHref },
    learnMore: makerPositionModal(v.status, !!v.lse),
    menu,
  };

  // Closed / liquidated: ink and art have settled to 0, so the headline is what
  // the vault held at its height — highest recorded collateral + DAI debt (the
  // MAX of the per-event balances, each event's art repriced at its own historic
  // rate). DAI is measured at recorded on-chain events, so between-event fee
  // accrual is not reflected.
  if (v.status === "closed" || v.status === "liquidated") {
    const heads: PositionCardHead[] = [
      {
        id: "peak-collateral",
        label: CARD_VOCAB.peakCollateral,
        labelTip: "The most collateral the vault held at any of its events.",
        value:
          v.peakInk > 0 ? (
            <Prov info={peakInkProv(v.collateralSymbol, { ilk: v.ilk })}>
              <AssetAmount value={v.peakInk} symbol={v.collateralSymbol} display={collAmount(v.peakInk)} />
            </Prov>
          ) : null,
      },
      {
        id: "peak-debt",
        label: CARD_VOCAB.peakDebt,
        labelTip: "The most the vault owed at any of its events, stability fee accrued to that event included.",
        value:
          v.peakDebtDai != null && v.peakDebtDai > 0 ? (
            <Prov info={peakDebtProv(debtSym, { ilk: v.ilk })}>
              <AssetAmount value={v.peakDebtDai} symbol={debtSym} />
            </Prov>
          ) : null,
        sub: v.peakDebtDai != null && v.peakDebtDai > 0 ? "the most it owed at any event, fee included" : undefined,
      },
    ];
    const endTip =
      v.status === "liquidated"
        ? "A liquidation emptied this vault. It still belongs to its owner and can take a new deposit."
        : "This vault owes nothing and its collateral has been taken out. It still belongs to its owner and can take a new deposit.";
    const outcome: PositionCardOutcome = {
      word: v.status === "liquidated" ? "Liquidated" : "Closed",
      dates: v.lastActivityAt != null ? [{ at: v.lastActivityAt }] : undefined,
      // The shell's Outcome column has no tip of its own: the sentence rides
      // under the dates.
      footnote: (
        <div className="mt-0.5 text-xs text-rb-500">
          <RevealTip tip={endTip} label={`${v.status === "liquidated" ? "Liquidated" : "Closed"}: ${endTip}`} focusable>
            <span className="underline decoration-dotted decoration-rb-400 underline-offset-2">What this means</span>
          </RevealTip>
        </div>
      ),
    };
    if (!detail) return { ...common, heads, outcome, surface: "listing", menu: null };
    return { ...common, ...detailCommon, heads, outcome };
  }

  const heads: PositionCardHead[] = [
    {
      id: "collateral",
      label: CARD_VOCAB.collateral,
      labelTip: v.priceCap
        ? `The ${v.collateralSymbol} locked in the vault, valued at Maker's price: the oracle's, capped by governance.`
        : `The ${v.collateralSymbol} locked in the vault, valued at Maker's oracle price.`,
      value: (
        <Prov info={vaultInkProv(v.collateralSymbol, v.atBlock, false, v.source)}>
          <AssetAmount value={v.ink} symbol={v.collateralSymbol} />
        </Prov>
      ),
      usd:
        v.collateralUsd != null ? (
          <Prov info={collateralUsdProv(v.collateralSymbol, formatNumber(v.ink), v.priceUsd ?? 0)}>
            <span className="font-bold text-green-400">{formatUsd(v.collateralUsd)}</span>
          </Prov>
        ) : null,
      // The feed is capped under the oracle, so the value is at the cap
      // (TO-DO-ui-jobs 189).
      sub:
        capBinds && v.priceCap ? (
          <RevealTip tip={capTip(v)} label={`Capped price: ${capTip(v)}`} focusable className="focus-ring rounded-sm">
            <span className="underline decoration-dotted decoration-rb-400 underline-offset-2">
              at the {usdPrice(v.priceCap.capUsd)} cap
            </span>
          </RevealTip>
        ) : undefined,
    },
    {
      id: "debt",
      label: CARD_VOCAB.debt,
      labelTip: `The ${debtSym} the vault owes: what it drew plus the stability fee added since.`,
      value:
        v.debtDai != null && v.rate ? (
          <Prov info={daiDebtProv(artHuman, v.rate, debtSym)}>
            <AssetAmount value={v.debtDai} symbol={debtSym} />
          </Prov>
        ) : (
          <Prov info={vaultArtProv(v.atBlock, false, v.source)}>{artHuman} art</Prov>
        ),
      usd:
        v.debtDai != null && v.rate && v.debtDai > 0 ? (
          <Prov info={debtUsdProv(debtSym, v.debtDai)}>
            <span className="font-bold text-green-400">{formatUsd(v.debtDai)}</span>
          </Prov>
        ) : null,
    },
    {
      id: "collateral-ratio",
      label: ratioLabel("cdp"),
      labelTip:
        "The collateral's value divided by the debt. Below the collateral type's minimum the vault can be liquidated.",
      value:
        ratio != null ? (
          <Prov
            info={collateralRatioProv(
              v.collateralUsd != null ? formatUsd(v.collateralUsd) : "—",
              v.debtDai != null ? `${formatNumber(v.debtDai)} ${debtSym}` : "—",
            )}
          >
            {ratio.toFixed(0)}%
          </Prov>
        ) : null,
    },
  ];

  if (!detail) return { ...common, heads, surface: "listing", menu: null };
  return { ...common, ...detailCommon, heads, outcome: undefined, panel: makerdaoPanelColumns(v) };
}

/** The Maker vault card: its slots, drawn by the shared card. */
export function MakerVaultCard(props: MakerVaultCardProps) {
  return <PositionCard slots={makerVaultCardSlots(props)} />;
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
