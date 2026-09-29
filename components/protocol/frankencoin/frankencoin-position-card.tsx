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
import { RevealTip } from "@/components/shared/reveal-tip";
import { PositionCardMeta } from "@/components/shared/position-card-meta";
import { StatValue, StatDash, StatFootnote } from "@/components/shared/stat-value";
import { AssetAmount } from "@/components/shared/asset-amount";
import { WalletPill } from "@/components/shared/wallet-pill";
import { Icon } from "@/components/icons/icon";
import { formatUnitsExact } from "@/lib/utils/format";
import { Prov } from "@/components/shared/provenance";
import { PositionCardShell } from "@/components/shared/position-card-shell";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { soldPeakProv, latestAbsoluteProv, peakAbsoluteProv } from "@/lib/frankencoin/event-provenance";
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
import { AmountText } from "@/components/shared/amount-text";
import { formatDate } from "@/lib/date";

export interface FrankencoinPositionView {
  /** Lowercased Position contract address — the identity. */
  position: string;
  hub: "v1" | "v2";
  owner: string | null;
  isClone: boolean;
  /** The original a clone was cloned from — chain lane only. */
  original?: string | null;
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
  /** The reserve share held against the debt, ZCHF — chain lane only. */
  reserveHeld?: number | null;
}

/** How a terminal position ended, from its timeline: the forced sale that
 *  sold its collateral and the denial, each with its time. */
export interface FrankencoinEnding {
  /** The forced sale that sold collateral (the last one that did). */
  forcedAt: number | null;
  /** The most collateral one transaction's sales sold (a forced sale or a
   *  challenge's slices), whole units. */
  soldMost: number | null;
  deniedAt: number | null;
  /** The position closed in a challenge sale's transaction. */
  closedByChallenge?: boolean;
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

/** The position-grain identity: the contract address + which hub + lineage,
 *  each explained on hover or tap. */
function PositionIdentity({ v, cloneParent }: { v: FrankencoinPositionView; cloneParent?: string | null }) {
  const hubTip =
    v.hub === "v1"
      ? "Minting Hub V1 (2023), the first of Frankencoin's two hubs. It opened this position and runs its challenges."
      : "Minting Hub V2 (2024), the current hub. It opened this position and runs its challenges and, after expiry, the sale of its collateral.";
  return (
    <span className="text-xs text-rb-500 tabular-nums">
      <RevealTip
        tip="The position's own contract address. Every Frankencoin position is a contract of its own."
        label="Position contract address"
        focusable
        className="focus-ring rounded-sm"
      >
        {shortAddress(v.position)}
      </RevealTip>
      <span className="mx-1 text-rb-400">·</span>
      <RevealTip tip={hubTip} label={hubTip} focusable className="focus-ring rounded-sm">
        {v.hub === "v1" ? "Hub V1" : "Hub V2"}
      </RevealTip>
      <span className="mx-1 text-rb-400">·</span>
      {v.isClone ? (
        <RevealTip
          tip={cloneTip(v.original ?? null, cloneParent ?? null)}
          label="Clone"
          focusable
          className="focus-ring rounded-sm"
        >
          clone
        </RevealTip>
      ) : (
        <RevealTip tip={ORIGINAL_TIP} label="Original" focusable className="focus-ring rounded-sm">
          original
        </RevealTip>
      )}
    </span>
  );
}

const ORIGINAL_TIP =
  "An original: it proposed its own terms, paid the opening fee and faced a veto window before it could mint. A clone copies an original's terms and shares its minting limit.";

/** The clone chip's tip: the position it was cloned from and, when that is
 *  not the family's original, the original too. */
function cloneTip(root: string | null, parent: string | null): string {
  if (parent && root && parent !== root)
    return `A clone: cloned from ${shortAddress(parent)}, a clone of the family's original ${shortAddress(root)}. It is a position of its own, started at ${shortAddress(parent)}'s declared price on the original's other terms, and shares the family's minting limit.`;
  const of = parent ?? root;
  return `A clone${of ? ` of ${shortAddress(of)}` : ""}: a position of its own on that original's terms, sharing its minting limit.`;
}

/** The orthogonal challenge marker — caution triangle + count, named as
 *  challenges (never "liquidations": Frankencoin's own vocabulary). */
function ChallengeMarker({ count, closedBySale }: { count: number; closedBySale: boolean }) {
  if (count <= 0) return null;
  const times = `Challenged ${count} time${count === 1 ? "" : "s"}`;
  const title = closedBySale
    ? `${times}. A challenge sale took its collateral below the position's minimum, which closed it.`
    : `${times}. A challenged position can survive its auction.`;
  return (
    // Mounted outside PositionCardMeta's cluster (Frankencoin's own vocabulary,
    // never "liquidations"); RevealTip gives it the same hover, tap and
    // keyboard tip as that cluster's badges.
    <RevealTip tip={title} label={title} focusable className="text-caution-400 focus-ring rounded-sm">
      <Icon name="triangle" size={12} />
      <span className="ml-1 font-semibold text-xs">{count}</span>
    </RevealTip>
  );
}

function MetaCluster({ v, closedBySale = false }: { v: FrankencoinPositionView; closedBySale?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <PositionCardMeta lastActivityAt={v.lastActivityAt} eventCount={v.txCount} />
      <ChallengeMarker count={v.challengeCount} closedBySale={closedBySale} />
    </span>
  );
}

/** The card's identity lead, one node for open and closed cards: the owner
 *  wallet pill (facehash + copy + bookmark — the bookmark keys off the owner
 *  wallet, so the address is its home) when the owner is known, then the
 *  position's own identity (contract address · hub · clone). */
function IdentityLead({ v, cloneParent }: { v: FrankencoinPositionView; cloneParent?: string | null }) {
  if (!v.owner) return <PositionIdentity v={v} cloneParent={cloneParent} />;
  return (
    <span className="flex items-center gap-2">
      <WalletPill wallet={v.owner} ensName={null} filterProtocol="frankencoin" bookmarkProtocol="frankencoin" />
      <PositionIdentity v={v} cloneParent={cloneParent} />
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

/** A closed card's expiry: the date its terms ran to. */
function closedExpiryText(expiration: number | null): string | null {
  if (expiration == null || expiration <= 0) return null;
  return `${expiration * 1000 <= Date.now() ? "expiry was" : "expiry"} ${formatDate(expiration)}`;
}

export function FrankencoinPositionCard({
  v,
  receipts = false,
  rowExtra,
  explanation,
  viewHref,
  surface = "detail",
  cloneParent,
  ending,
}: {
  /** How a terminal position ended, where the timeline says. */
  ending?: FrankencoinEnding | null;
  v: FrankencoinPositionView;
  /** The position a clone was cloned from (PositionOpened's parent), where the
   *  timeline has it; `v.original` is the family's original. */
  cloneParent?: string | null;
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
    const forcedAt = ending?.forcedAt ?? null;
    const deniedAt = v.status === "denied" ? (ending?.deniedAt ?? null) : null;
    // The outcome names how it ended: a denial on its date, a forced sale on
    // the sale's date. A denied position later force-sold says so beside it.
    const outcomeLabel = v.status === "closed" && forcedAt != null ? "Forced sale" : undefined;
    const closedAt = deniedAt ?? (v.status === "closed" && forcedAt != null ? forcedAt : v.lastActivityAt);
    const extra =
      v.status === "denied" && forcedAt != null
        ? {
            label: "Then",
            value: (
              <>
                <div className="text-lg font-bold mt-2 text-rb-500">Forced sale</div>
                <div className="text-xs text-rb-500 mt-0.5">{formatDate(forcedAt)}</div>
              </>
            ),
          }
        : {
            label: "Challenges",
            value: (
              <div className="text-lg font-bold mt-2 text-rb-500">
                {v.challengeCount === 0 ? "Never challenged" : v.challengeCount}
              </div>
            ),
          };
    // Collateral the ledger never recorded (deposited without a MintingUpdate)
    // still shows as the amount a sale sold.
    const peakCollateral =
      v.peakCollateral != null && v.peakCollateral > 0 ? v.peakCollateral : (ending?.soldMost ?? null);
    const peakFromSale = !(v.peakCollateral != null && v.peakCollateral > 0) && peakCollateral != null;
    return (
      <PositionCardShell
        receipts={receipts}
        rowExtra={rowExtra}
        explanation={explanation}
        viewHref={viewHref}
        learnMore={frankencoinPositionContent({ status: v.status, forcedSale: forcedAt != null })}
      >
        <ClosedPositionStats
          outcome={v.status}
          outcomeLabel={outcomeLabel}
          extra={extra}
          leadingIdentity={<IdentityLead v={v} cloneParent={cloneParent} />}
          identity={<MetaCluster v={v} closedBySale={v.status === "closed" && ending?.closedByChallenge === true} />}
          closedAt={closedAt ?? undefined}
          collateral={
            peakCollateral != null && peakCollateral > 0 ? (
              <StatValue>
                <Prov
                  info={
                    peakFromSale ? soldPeakProv(v.collateralSymbol) : peakAbsoluteProv("collateral", v.collateralSymbol)
                  }
                >
                  <AssetAmount value={peakCollateral} symbol={v.collateralSymbol} />
                </Prov>
              </StatValue>
            ) : (
              <StatDash />
            )
          }
          collateralFootnote={
            peakFromSale ? (
              <StatFootnote>{forcedAt != null ? "sold in its forced sale" : "sold in a challenge"}</StatFootnote>
            ) : undefined
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
          debtFootnote={
            <>
              <StatFootnote>minted ZCHF</StatFootnote>
              {closedExpiryText(v.expiration) && (
                <div className="text-xs mt-0.5 text-rb-500">{closedExpiryText(v.expiration)}</div>
              )}
            </>
          }
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
            <RevealTip
              tip="An open minting position: it holds collateral and can mint ZCHF against it."
              label="Minting: an open minting position"
              focusable
              className="focus-ring rounded-sm"
            >
              <span className="font-bold px-2 py-0.5 rounded-sm text-xs bg-rb-300 dark:bg-rb-700 text-foreground/80 dark:text-foreground/60">
                Minting
              </span>
            </RevealTip>
          ) : (
            <span className={`font-bold tracking-wider px-2 py-0.5 rounded-xs text-xs ${st.cls}`}>{st.label}</span>
          )
        }
        leadingIdentity={<IdentityLead v={v} cloneParent={cloneParent} />}
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
                      liq. price <AmountText value={v.liqPrice} /> ZCHF/{v.collateralSymbol}
                    </span>
                  </Prov>{" "}
                  <span className="text-rb-400">(owner-declared)</span>
                  {surface === "detail" && v.collateral != null && v.collateral * v.liqPrice - v.minted > -0.005 && (
                    <div className="mt-0.5">
                      headroom <AmountText value={Math.max(0, v.collateral * v.liqPrice - v.minted)} /> ZCHF at this
                      price
                    </div>
                  )}
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
                    a year on today&rsquo;s terms, charged at each mint
                  </div>
                )}
                {v.minted > 0 && v.reserveHeld != null && v.reserveHeld > 0 && (
                  <div className="text-xs mt-0.5 text-rb-500">
                    <AmountText value={v.minted - v.reserveHeld} /> ZCHF repays it in full
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
    original: c.original,
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
    reserveHeld: c.reserveHeld,
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
