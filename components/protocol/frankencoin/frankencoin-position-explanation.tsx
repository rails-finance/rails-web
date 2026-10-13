"use client";

// The Frankencoin position card's explanation (zone Z1): a lead, then bullets
// under Holdings, Risk, Rate and History when two of them hold two or more
// bullets (rails-ops standards/prose-limits-and-zones.md 3.3). The collateral,
// debt, declared price and rate carry the card's receipts (one receipt per
// figure, lib/frankencoin/live-provenance.ts).
// The words are content/frankencoin/event-prose.yaml's `position_words`; this
// file chooses which to say and draws each figure as the card does. The
// figures are the position contract read at head; the mechanisms behind them
// are the card's "?" (position_* in the same file). Frankencoin has no health
// factor and no USD: the risk is the declared price, a running challenge or
// pause, and the expiry.

import type { ReactNode } from "react";
import type { FrankencoinChainResponse } from "@/lib/api/fetch-frankencoin-position";
import { ppmToPct } from "@/lib/frankencoin/asset-catalog";
import { frankencoinChargedTerm } from "@/lib/frankencoin/use-event-read";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { arrangeByHeading } from "@/lib/shared/event-prose/nodes";
import { FRANKENCOIN_WORDS, positionWords } from "@/lib/frankencoin/event-templates";
import { positionNodes } from "@/lib/frankencoin/position-nodes";
import { formatDate } from "@/lib/date";
import { gapText } from "@/lib/frankencoin/figures";
import { AmountText } from "@/components/shared/amount-text";
import { Prov } from "@/components/shared/provenance";
import { formatUnitsExact } from "@/lib/utils/format";
import {
  liveCollateralProv,
  liveInterestProv,
  liveLiqPriceProv,
  liveMintedProv,
} from "@/lib/frankencoin/live-provenance";
import { LinkedAddress } from "@/components/shared/linked-address";
import type { FrankencoinEnding } from "./frankencoin-position-card";

const GROUPS = ["holdings", "risk", "rate", "history"] as const;
type Group = (typeof GROUPS)[number];
type Bullet = { group: Group; node: ReactNode };

const arrange = (bullets: Bullet[]) => {
  const heading: Record<Group, string> = {
    holdings: positionWords("heading_holdings"),
    risk: positionWords("heading_risk"),
    rate: positionWords("heading_rate"),
    history: positionWords("heading_history"),
  };
  return arrangeByHeading(bullets, GROUPS, (g) => heading[g]);
};

const bulletOf = (group: Group, key: string, node: ReactNode): Bullet => ({
  group,
  node: <span key={key}>{node}</span>,
});

const pct = (n: number) => `${n.toFixed(2)}%`;

export function FrankencoinPositionExplanation({
  chain,
  openedAt,
  challengeCount,
  denied,
  cloneParent,
  ending,
  closedAt,
}: {
  chain: FrankencoinChainResponse;
  /** How a terminal position ended (the forced sale, the denial). */
  ending?: FrankencoinEnding | null;
  /** The position's last activity: when a closed position closed. */
  closedAt?: number | null;
  /** The position a clone was cloned from (the timeline's PositionOpened
   *  parent); `chain.original` is the family's original. */
  cloneParent?: string | null;
  /** The PositionOpened timestamp from the index: the veto window is start −
   *  opened. Omit to skip the bullet. */
  openedAt?: number | null;
  /** Replayed challenge count from the index. Omit to skip the bullet. */
  challengeCount?: number;
  /** The indexed PositionDenied fact (not head-observable). */
  denied?: boolean;
}) {
  const sym = chain.collateralSymbol ?? "";
  const now = Date.now() / 1000;
  const hasColl = chain.collateral != null && chain.collateral > 0;
  const hasMint = chain.minted != null && chain.minted > 0;
  const v1 = chain.hub === "v1";
  const amount = (n: number) => <AmountText value={n} />;
  const strong = (n: number) => (
    <H>
      <AmountText value={n} />
    </H>
  );
  // The card's receipts, echoed where the pane states the same figure.
  const collNode = () => (
    <Prov
      echo
      info={liveCollateralProv(sym, chain.position)}
      value={
        chain.collateralRaw != null ? formatUnitsExact(chain.collateralRaw, chain.collateralDecimals ?? 0) : undefined
      }
      symbol={sym}
    >
      {strong(chain.collateral!)}
    </Prov>
  );
  const debtNode = () => (
    <Prov
      echo
      info={liveMintedProv(chain.position)}
      value={chain.mintedRaw != null ? formatUnitsExact(chain.mintedRaw, 18) : undefined}
      symbol="ZCHF"
    >
      {strong(chain.minted!)}
    </Prov>
  );

  // The status lead: subject-first, one sentence.
  const lead: ReactNode = chain.isClosed
    ? positionNodes("lead_closed")
    : hasColl && hasMint
      ? positionNodes("lead_both", { coll: collNode(), coll_symbol: sym, debt: debtNode() })
      : hasColl
        ? positionNodes("lead_coll", { coll: collNode(), coll_symbol: sym })
        : hasMint
          ? positionNodes("lead_debt", { debt: debtNode() })
          : null;

  const bullets: Bullet[] = [];

  // ── Holdings: what clearing the debt takes ──
  if (!chain.isClosed && hasMint && chain.reserveHeld != null && chain.reserveHeld > 0) {
    bullets.push(
      bulletOf(
        "holdings",
        "reserve",
        positionNodes("repay_need", {
          net: strong((chain.minted as number) - chain.reserveHeld),
          reserve: amount(chain.reserveHeld),
        }),
      ),
    );
  }

  // ── Risk: the declared price and the room it leaves, a running challenge,
  // a running pause, the expiry ──
  if (!chain.isClosed && chain.liqPrice != null && chain.liqPrice > 0) {
    const price = (
      <Prov
        echo
        info={liveLiqPriceProv(sym, chain.collateralDecimals ?? 0, chain.position)}
        value={String(chain.liqPrice)}
      >
        {strong(chain.liqPrice)}
      </Prov>
    );
    const ceiling = chain.mintCeiling != null && chain.mintCeiling > 0 && !denied ? chain.mintCeiling : null;
    const node =
      ceiling == null
        ? positionNodes("price_only", { price, coll_symbol: sym })
        : !hasMint
          ? positionNodes("price_idle", { price, coll_symbol: sym, ceiling: amount(ceiling) })
          : Math.abs(ceiling - (chain.minted as number)) < 0.005
            ? positionNodes("price_full", { price, coll_symbol: sym })
            : ceiling > (chain.minted as number)
              ? positionNodes("price_room", {
                  price,
                  coll_symbol: sym,
                  room: amount(ceiling - (chain.minted as number)),
                })
              : positionNodes("price_only", { price, coll_symbol: sym });
    bullets.push(bulletOf("risk", "price", node));
  }
  const challenging = chain.challengedAmount != null && chain.challengedAmount > 0;
  if (!chain.isClosed && challenging) {
    bullets.push(
      bulletOf(
        "risk",
        "challenged",
        positionNodes("challenged_now", { challenged: strong(chain.challengedAmount as number), coll_symbol: sym }),
      ),
    );
  }
  if (!chain.isClosed && chain.cooldownActive && chain.cooldownUntil != null) {
    bullets.push(
      bulletOf("risk", "paused", positionNodes("paused", { until: <H>{formatDate(chain.cooldownUntil)}</H> })),
    );
  }
  if (!chain.isClosed && chain.expiration != null && chain.expiration > 0) {
    const expiry = formatDate(chain.expiration);
    const days = Math.round((chain.expiration - now) / 86400);
    bullets.push(
      bulletOf(
        "risk",
        "expiry",
        chain.expired
          ? v1
            ? positionNodes("expired_v1", { expiry: <H>{expiry}</H> })
            : positionNodes("expired", { expiry: <H>{expiry}</H> })
          : v1
            ? positionNodes("expires_v1", { expiry, days: <H>{days.toLocaleString("en-US")}</H> })
            : positionNodes("expires", { expiry, days: <H>{days.toLocaleString("en-US")}</H> }),
      ),
    );
  }

  // ── Rate: what a mint made now pays ──
  if (!chain.isClosed && !denied && !chain.mintingDisabledForGood && chain.annualInterestPPM != null) {
    const rate = (
      <Prov echo info={liveInterestProv(chain.hub, chain.position)}>
        <H>{pct(ppmToPct(chain.annualInterestPPM))}</H>
      </Prov>
    );
    const feeFrom = chain.start != null ? Math.max(now, chain.start) : now;
    const term =
      chain.expiration != null && chain.expiration > feeFrom
        ? frankencoinChargedTerm(chain.hub, chain.expiration, feeFrom)
        : null;
    const feePct = term != null ? Math.min(100, ppmToPct(chain.annualInterestPPM) * (term.days / 365)) : null;
    bullets.push(
      bulletOf(
        "rate",
        "rate",
        feePct == null
          ? positionNodes("rate_only", { rate })
          : v1
            ? positionNodes("rate_v1", { rate, fee: pct(feePct) })
            : positionNodes("rate", { rate, fee: pct(feePct) }),
      ),
    );
  }

  // ── History ──
  if (!denied && chain.start != null && openedAt != null && openedAt > 0 && !chain.isClone && chain.start > openedAt) {
    const vetoDays = Math.round(((chain.start - openedAt) / 86400) * 10) / 10;
    bullets.push(bulletOf("history", "veto", positionNodes("veto", { veto_days: amount(vetoDays) })));
  }
  if (chain.isClone && chain.original) {
    const parent = cloneParent && cloneParent !== chain.original ? cloneParent : null;
    bullets.push(
      bulletOf(
        "history",
        "clone",
        parent
          ? positionNodes("clone_deep", {
              parent: <LinkedAddress address={parent} />,
              original: <LinkedAddress address={chain.original} />,
            })
          : positionNodes("clone", { original: <LinkedAddress address={chain.original} /> }),
      ),
    );
  }
  if (denied) {
    const at = ending?.deniedAt ?? null;
    bullets.push(
      bulletOf(
        "history",
        "denied",
        at != null ? positionNodes("denied", { date: <H>{formatDate(at)}</H> }) : positionNodes("disabled"),
      ),
    );
  } else if (chain.mintingDisabledForGood && !chain.isClosed) {
    bullets.push(bulletOf("history", "disabled", positionNodes("disabled")));
  }
  if (challengeCount === 0 && !denied) {
    bullets.push(bulletOf("history", "never", positionNodes(chain.isClosed ? "never_closed" : "never")));
  } else if (challengeCount != null && challengeCount > 0 && !chain.isClosed && !challenging) {
    bullets.push(
      bulletOf(
        "history",
        "challenged",
        positionNodes("challenged_count", {
          times: <H>{challengeCount.toLocaleString("en-US")}</H>,
          times_word: challengeCount === 1 ? FRANKENCOIN_WORDS.time_one : FRANKENCOIN_WORDS.time_many,
        }),
      ),
    );
  }

  // How a closed position ended.
  if (chain.isClosed) {
    const forcedAt = ending?.forcedAt ?? null;
    const expiration = chain.expiration != null && chain.expiration > 0 ? chain.expiration : null;
    let node: ReactNode = null;
    if (forcedAt != null && expiration != null && forcedAt > expiration) {
      node = positionNodes("forced_close", {
        expiry: formatDate(expiration),
        since: <H>{gapText(forcedAt - expiration)}</H>,
      });
    } else if (ending?.closedByChallenge && closedAt != null) {
      node = positionNodes("sale_close", { date: <H>{formatDate(closedAt)}</H> });
    } else if (expiration != null && closedAt != null) {
      node = positionNodes(closedAt > expiration ? "closed_after" : "closed_before", {
        closed: <H>{formatDate(closedAt)}</H>,
        expiry: formatDate(expiration),
      });
    } else if (expiration != null) {
      node = positionNodes("terms_ran", { expiry: formatDate(expiration) });
    }
    if (node) bullets.push(bulletOf("history", "ending", node));
  }

  if (lead == null && bullets.length === 0) return null;
  return <ProseExplainer paragraph={lead} items={arrange(bullets)} />;
}
