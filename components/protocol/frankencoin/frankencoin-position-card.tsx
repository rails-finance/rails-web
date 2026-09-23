"use client";

// Frankencoin position card — one Position contract, through the SAME shared
// grammar (OpenPositionStats + StatValue) as the other explorers.
//
// THE GRAIN IS THE CONTRACT: the card is one Position clone — the address is
// the identity, the owner a mutable fact shown beside it. UNITS ARE NATIVE:
// collateral in the position's own token (per-token decimals from the row —
// four observed collaterals are decimals=0), debt in ZCHF. There is NO USD
// column and no dollar anywhere: Frankencoin is oracle-free, and the one
// price on the card — the liquidation price footnote — is OWNER-DECLARED,
// labeled so, in ZCHF per token.
//
// STATUS IS TWO-AXIS. The lifecycle pill says open / closed / denied /
// expired; the challenge history is the orthogonal axis — an OPEN position
// that survived a challenge stays an OPEN card with the meta cluster's
// caution count (challenges, named as challenges, never "liquidations").
// There is NO health column and no invented health factor: risk here is
// challenge status + the declared price + the expiry, and the detail page's
// live strips carry exactly those.
//
// The card view builds from EITHER lane: `viewFromSummary` (the index row —
// the latest MintingUpdate absolutes) or `viewFromChain` (the live overlay —
// the position's own slots at head, the primary truth on the detail page).

import { OpenPositionStats } from "@/components/shared/open-position-stats";
import { ClosedPositionStats } from "@/components/shared/closed-position-stats";
import { PositionCardMeta } from "@/components/shared/position-card-meta";
import { StatValue, StatDash, StatFootnote } from "@/components/shared/stat-value";
import { AssetAmount } from "@/components/shared/asset-amount";
import { WalletPill } from "@/components/shared/wallet-pill";
import { Icon } from "@/components/icons/icon";
import { formatUnitsExact, formatNumber } from "@/lib/utils/format";
import { Prov } from "@/components/shared/provenance";
import { PositionCardShell } from "@/components/shared/position-card-shell";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { latestAbsoluteProv, peakAbsoluteProv } from "@/lib/frankencoin/event-provenance";
import {
  liveMintedProv,
  liveCollateralProv,
  liveLiqPriceProv,
  liveInterestProv,
} from "@/lib/frankencoin/live-provenance";
import { ppmToPct, shortAddress } from "@/lib/frankencoin/asset-catalog";
import { frankencoinPositionContent } from "@/lib/frankencoin/position-content";
import type { Provenance } from "@/components/shared/provenance";
import type { FrankencoinPositionSummary, FrankencoinPositionStatus } from "@/lib/sources/api/frankencoin-positions";
import type { FrankencoinChainResponse } from "@/lib/api/fetch-frankencoin-position";

export interface FrankencoinPositionView {
  /** Lowercased Position contract address — the identity. */
  position: string;
  hub: "v1" | "v2";
  owner: string | null;
  isClone: boolean;
  collateralSymbol: string;
  collateralDecimals: number;
  /** NULL ≠ zero on the index lane: the ledger never spoke (direct-transferred
   *  collateral is invisible to events) — rendered a dash; the chain lane
   *  corrects at head. */
  collateral: number | null;
  collateralRaw: string | null;
  minted: number;
  mintedRaw: string | null;
  /** Owner-declared liquidation price, ZCHF per whole token. */
  liqPrice: number | null;
  /** The API speaks open/closed/denied; "expired" exists ONLY on the chain
   *  lane (expiration is not an event fact — the overlay is its sole source). */
  status: FrankencoinPositionStatus | "expired";
  challengeCount: number;
  everChallenged: boolean;
  /** Closed-card headlines (lifetime maxima); null when the index lacks them. */
  peakCollateral: number | null;
  peakMinted: number | null;
  /** From the chain overlay ONLY — the API carries no expiration. */
  expiration: number | null;
  lastActivityAt: number | null;
  txCount: number;
  /** Which lane the figures assert: the live overlay or the indexed ledger. */
  basis: "chain" | "index";
  /** The position's fixed annual interest (ppm) — chain lane only. */
  annualInterestPPM: number | null;
}

/** The card's lifecycle vocabulary: the API's three + the chain-only
 *  "expired" (expiration is head state, never an API fact). */
export type FrankencoinCardStatus = FrankencoinPositionStatus | "expired";

const STATUS: Record<FrankencoinCardStatus, { label: string; cls: string }> = {
  open: { label: "OPEN", cls: "bg-positive/20 text-positive" },
  closed: { label: "CLOSED", cls: "bg-rb-300 dark:bg-rb-700 text-foreground/70" },
  denied: { label: "DENIED", cls: "bg-red-500/20 text-red-500" },
  expired: { label: "EXPIRED", cls: "bg-caution-400/20 text-caution-400" },
};

const collProv = (v: FrankencoinPositionView): Provenance =>
  v.basis === "chain"
    ? liveCollateralProv(v.collateralSymbol, v.position)
    : latestAbsoluteProv("collateral", v.collateralSymbol, v.collateralDecimals);

const mintedProv = (v: FrankencoinPositionView): Provenance =>
  v.basis === "chain" ? liveMintedProv(v.position) : latestAbsoluteProv("minted", "ZCHF", 18);

const liqPriceProv = (v: FrankencoinPositionView): Provenance =>
  v.basis === "chain"
    ? liveLiqPriceProv(v.collateralSymbol, v.collateralDecimals, v.position)
    : latestAbsoluteProv("price", v.collateralSymbol, v.collateralDecimals);

/** The position-grain identity: the contract address + which hub + lineage. */
function PositionIdentity({ v }: { v: FrankencoinPositionView }) {
  return (
    <span className="text-xs text-rb-500 tabular-nums">
      {shortAddress(v.position)}
      <span className="mx-1 text-rb-400">·</span>
      {v.hub === "v1" ? "Hub V1" : "Hub V2"}
      {v.isClone && (
        <>
          <span className="mx-1 text-rb-400">·</span>
          clone
        </>
      )}
    </span>
  );
}

/** The orthogonal challenge marker — caution triangle + count, named as
 *  challenges (never "liquidations": Frankencoin's own vocabulary). */
function ChallengeMarker({ count }: { count: number }) {
  if (count <= 0) return null;
  const title = `Challenged ${count} time${count === 1 ? "" : "s"} — a challenged position can survive its auction`;
  return (
    <span className="inline-flex items-center text-caution-400" title={title} aria-label={title}>
      <Icon name="triangle" size={12} />
      <span className="ml-1 font-semibold text-xs">{count}</span>
    </span>
  );
}

function MetaCluster({ v }: { v: FrankencoinPositionView }) {
  return (
    <span className="flex items-center gap-2">
      <PositionCardMeta lastActivityAt={v.lastActivityAt} eventCount={v.txCount} />
      <ChallengeMarker count={v.challengeCount} />
    </span>
  );
}

/** The card's identity lead, one node for open and closed cards: the owner
 *  wallet pill (facehash + copy + bookmark — the bookmark keys off the owner
 *  wallet, so the address is its home) when the owner is known, then the
 *  position's own identity (contract address · hub · clone). */
function IdentityLead({ v }: { v: FrankencoinPositionView }) {
  if (!v.owner) return <PositionIdentity v={v} />;
  return (
    <span className="flex items-center gap-2">
      <WalletPill wallet={v.owner} ensName={null} filterProtocol="frankencoin" bookmarkProtocol="frankencoin" />
      <PositionIdentity v={v} />
    </span>
  );
}

/** Expiry footnote — a countdown against the position's own clock. */
function expiryText(expiration: number | null): string | null {
  if (expiration == null || expiration <= 0) return null;
  const now = Date.now() / 1000;
  const days = (expiration - now) / 86400;
  if (days <= 0) return "expired";
  if (days < 1) return "expires in less than a day";
  return `expires in ${Math.round(days)}d`;
}

export function FrankencoinPositionCard({
  v,
  receipts = false,
  rowExtra,
  explanation,
  viewHref,
  surface = "detail",
}: {
  v: FrankencoinPositionView;
  receipts?: boolean;
  /** Context content riding the shell's heading-button row. */
  rowExtra?: React.ReactNode;
  /** The card's Explanation section (narration describing the position NOW). */
  explanation?: React.ReactNode;
  /** Copy-this-view control, forwarded straight through to `PositionCardShell`
   *  — the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
  /** Which surface renders the card — the two-axis pill rule: listing cards
   *  carry the lifecycle pill (green OPEN), the detail page the neutral mode
   *  word ("Minting" — the MintingHub's own vocabulary). Terminal states
   *  (DENIED / EXPIRED / closed) keep their lifecycle pills on both. */
  surface?: "listing" | "detail";
}) {
  const st = STATUS[v.status] ?? STATUS.open;

  // Terminal states — closed, DENIED (the challenge that never became a
  // position), or EXPIRED (past its deadline, unclaimed) — all draw the
  // shared terminal frame. The latest absolutes are back at zero for a
  // closed/denied position, so the headline is what the ledger recorded at
  // its height — lifetime maxima where the index carries them, an explicit
  // dash otherwise (never a fabricated figure).
  if (v.status === "closed" || v.status === "denied" || v.status === "expired") {
    return (
      <PositionCardShell
        receipts={receipts}
        rowExtra={rowExtra}
        explanation={explanation}
        viewHref={viewHref}
        learnMore={frankencoinPositionContent({ status: v.status })}
      >
        <ClosedPositionStats
          outcome={v.status}
          leadingIdentity={<IdentityLead v={v} />}
          identity={<MetaCluster v={v} />}
          closedAt={v.lastActivityAt ?? undefined}
          collateral={
            v.peakCollateral != null && v.peakCollateral > 0 ? (
              <StatValue>
                <Prov info={peakAbsoluteProv("collateral", v.collateralSymbol)}>
                  <AssetAmount value={v.peakCollateral} symbol={v.collateralSymbol} />
                </Prov>
              </StatValue>
            ) : (
              <StatDash />
            )
          }
          debt={
            v.peakMinted != null && v.peakMinted > 0 ? (
              <StatValue>
                <Prov info={peakAbsoluteProv("minted", "ZCHF")}>
                  <AssetAmount value={v.peakMinted} symbol="ZCHF" />
                </Prov>
              </StatValue>
            ) : (
              <StatDash />
            )
          }
          debtLabel={CARD_VOCAB.peakDebt}
          debtFootnote={<StatFootnote>minted ZCHF</StatFootnote>}
        />
      </PositionCardShell>
    );
  }

  const expiry = expiryText(v.expiration);

  return (
    <PositionCardShell
      receipts={receipts}
      rowExtra={rowExtra}
      explanation={explanation}
      viewHref={viewHref}
      learnMore={frankencoinPositionContent({ status: "open" })}
    >
      <OpenPositionStats
        statusPill={
          surface === "detail" && v.status === "open" ? (
            <span className="font-bold px-2 py-0.5 rounded-sm text-xs bg-rb-300 dark:bg-rb-700 text-foreground/80 dark:text-foreground/60">
              Minting
            </span>
          ) : (
            <span className={`font-bold tracking-wider px-2 py-0.5 rounded-xs text-xs ${st.cls}`}>{st.label}</span>
          )
        }
        leadingIdentity={<IdentityLead v={v} />}
        identity={<MetaCluster v={v} />}
        columns={[
          {
            label: "Collateral",
            // NULL collateral = the ledger never spoke — a dash, never a zero
            // (the chain lane corrects at head on the detail page).
            // No `assetIcons` cluster: the value is a single-asset AssetAmount,
            // which already carries the ticker as its glyph — a cluster of the
            // same one symbol drew the icon twice. The cluster slot is for USD
            // headlines and stacks over several assets (Compound V2, Maple).
            value:
              v.collateral != null && v.collateral > 0 ? (
                <StatValue>
                  <Prov info={collProv(v)}>
                    <AssetAmount
                      value={v.collateral}
                      symbol={v.collateralSymbol}
                      exact={
                        v.collateralRaw != null ? formatUnitsExact(v.collateralRaw, v.collateralDecimals) : undefined
                      }
                    />
                  </Prov>
                </StatValue>
              ) : (
                <StatDash />
              ),
            footnote:
              v.liqPrice != null && v.liqPrice > 0 ? (
                <div className="text-xs mt-0.5 text-rb-500 tabular-nums">
                  <Prov info={liqPriceProv(v)}>
                    <span>
                      liq. price {formatNumber(v.liqPrice)} ZCHF/{v.collateralSymbol}
                    </span>
                  </Prov>{" "}
                  <span className="text-rb-400">(owner-declared)</span>
                </div>
              ) : undefined,
          },
          {
            label: CARD_VOCAB.debt,
            value:
              v.minted > 0 ? (
                <StatValue>
                  <Prov info={mintedProv(v)}>
                    <AssetAmount
                      value={v.minted}
                      symbol="ZCHF"
                      exact={v.mintedRaw != null ? formatUnitsExact(v.mintedRaw, 18) : undefined}
                    />
                  </Prov>
                </StatValue>
              ) : (
                <StatDash />
              ),
            footnote: (
              <>
                <StatFootnote>minted ZCHF</StatFootnote>
                {v.annualInterestPPM != null && (
                  <div className="text-xs mt-0.5 text-rb-500">
                    <Prov info={liveInterestProv(v.hub, v.position)}>
                      <span>{ppmToPct(v.annualInterestPPM).toFixed(2)}%</span>
                    </Prov>{" "}
                    annual interest, charged at minting
                  </div>
                )}
                {expiry && <div className="text-xs mt-0.5 text-rb-500">{expiry}</div>}
              </>
            ),
          },
          // No health column BY DESIGN: Frankencoin has no health factor, and
          // none is synthesized — the detail page's live strips carry the
          // challenge / declared-price / expiry / cooldown risk grammar.
        ]}
      />
    </PositionCardShell>
  );
}

/** Build a card view from the listing summary row (the indexed ledger). */
export function viewFromSummary(s: FrankencoinPositionSummary): FrankencoinPositionView {
  return {
    position: s.position,
    hub: s.hub,
    owner: s.owner,
    isClone: s.isClone,
    collateralSymbol: s.collateralSymbol,
    collateralDecimals: s.collateralDecimals,
    collateral: s.collateral,
    collateralRaw: s.collateralRaw,
    minted: s.minted,
    mintedRaw: s.mintedRaw,
    liqPrice: s.liqPrice,
    status: s.status,
    challengeCount: s.challengeCount,
    everChallenged: s.everChallenged,
    peakCollateral: s.peakCollateral,
    peakMinted: s.peakMinted,
    // The API carries NO expiration (a constructor fact, zero-RPC tier) —
    // the chain overlay is its sole source; listing cards simply omit expiry.
    expiration: null,
    lastActivityAt: s.lastActivityAt,
    txCount: s.txCount,
    basis: "index",
    annualInterestPPM: null,
  };
}

/** Build a card view from the live chain overlay — the detail page's primary
 *  truth: every figure is the position's own slot at head. The lifecycle can
 *  only say what head state shows (open / closed / expired); DENIED is an
 *  indexed fact (PositionDenied is not head-observable) and arrives by merge. */
export function viewFromChain(c: FrankencoinChainResponse): FrankencoinPositionView {
  return {
    position: c.position,
    hub: c.hub,
    owner: c.owner,
    isClone: c.isClone,
    collateralSymbol: c.collateralSymbol ?? (c.collateralToken ? shortAddress(c.collateralToken) : "—"),
    collateralDecimals: c.collateralDecimals ?? 0,
    // A failed balanceOf stays null → a dash, never a fabricated zero.
    collateral: c.collateral,
    collateralRaw: c.collateralRaw,
    minted: c.minted ?? 0,
    mintedRaw: c.mintedRaw,
    liqPrice: c.liqPrice,
    status: c.isClosed ? "closed" : c.expired ? "expired" : "open",
    challengeCount: 0,
    everChallenged: (c.challengedAmount ?? 0) > 0,
    peakCollateral: null,
    peakMinted: null,
    expiration: c.expiration,
    lastActivityAt: null,
    txCount: 0,
    basis: "chain",
    annualInterestPPM: c.annualInterestPPM,
  };
}

/** Merge the indexed summary into a chain-first view: the chain keeps every
 *  head figure (the primary truth); the index contributes what head state
 *  cannot say — the DENIED lifecycle, the challenge tallies, activity meta.
 *  ⚠️ Index-status is NEVER asserted equal to chain-status (the replay
 *  disagrees with head on measured edge positions — no-ledger opens, a 1-wei
 *  forced-sale remainder): apart from DENIED, the chain's lifecycle wins. */
export function mergeChainAndSummary(
  chain: FrankencoinPositionView,
  summary: FrankencoinPositionSummary,
): FrankencoinPositionView {
  return {
    ...chain,
    status: summary.status === "denied" ? "denied" : chain.status,
    challengeCount: summary.challengeCount,
    everChallenged: summary.everChallenged || chain.everChallenged,
    peakCollateral: summary.peakCollateral,
    peakMinted: summary.peakMinted,
    lastActivityAt: summary.lastActivityAt,
    txCount: summary.txCount,
  };
}
