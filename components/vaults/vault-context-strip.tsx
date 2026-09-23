"use client";

// The vault position card's context strip — WORDS ONLY.
// ----------------------------------------------------------------------------
// What the card cannot say and the sections under it should not have to: what
// is redeemable at this block, which function a holder leaves through, and —
// on a stake token — the cooldown that decides the first of those. It rides
// the card's heading-button row as `rowExtra`, the grammar the Liquity V2
// trove card set (components/shared/risk-footer-strip.tsx), and it returns a
// FRAGMENT of `RiskFigure` clusters so the caller's `RiskFooterStrip` lays
// them out as its own children rather than nesting a second strip inside one.
//
// NO BARS, NO METERS, NO COLOUR (Miles, 2026-09-09). `RiskMeter` is a `w-64`
// runway for a figure with two ends and a marker between them; a redeemable
// amount has neither, and drawing one would invent a scale the chain never
// stated. `RiskFigure`'s `caution` tone is refused for the same reason a
// slashable stake is not tinted anywhere else in this section: the state is
// the contract's, and the colour would be this page's opinion of it.
//
// CHAIN-AGNOSTIC BY SHAPE, NOT BY BRANCH. Ethereum's redeemable figure is
// `maxRedeem(holder)` in SHARE units and Base's is `maxWithdraw(holder)` in
// ASSET units — two different readings of two different contracts — so the
// caller hands in already-formatted words plus the receipt that traces them,
// and this file states them. The `figure` name travels with the props for the
// same reason: a check that reads "what is redeemable" off either chain reads
// the name the page's own loader answers under.
//
// AN UNREAD CALL IS SAID IN WORDS. `{ unread: true }` prints "not read" —
// never a dash, never a zero. A zero that WAS read is a reading and prints as
// one, which on a stake token outside its window is the whole point.

import { Fragment } from "react";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { RiskFigure, RiskStrong } from "@/components/shared/risk-footer-strip";

/** The redeemable reading, or the statement that it was not read. `figure` is
 *  the `data-figure` name the cluster wears, and it names the CALL: Ethereum's
 *  `maxRedeem`, Base's `maxWithdraw`. */
export type VaultRedeemable =
  | { text: string; prov: Provenance; figure: "holder-max-redeem" | "holder-max-withdraw" }
  | { unread: true; figure: "holder-max-redeem" | "holder-max-withdraw" };

export interface VaultContextStripProps {
  redeemable: VaultRedeemable;
  /** The contract's OWN function words for leaving — "redeem()",
   *  "cooldown(), then redeem()", "withdraw() or redeem()". Never a verb of
   *  this page's own choosing, and never advice. */
  exit: string;
  /** Umbrella stake tokens only; the other families hold no cooldown record. */
  cooldown?: { text: string; prov: Provenance };
}

export function VaultContextStrip({ redeemable, exit, cooldown }: VaultContextStripProps) {
  return (
    <Fragment>
      <RiskFigure label="Redeemable now">
        <span data-figure={redeemable.figure}>
          {"unread" in redeemable ? (
            <span>not read</span>
          ) : (
            <RiskStrong>
              <Prov info={redeemable.prov}>{redeemable.text}</Prov>
            </RiskStrong>
          )}
        </span>
      </RiskFigure>
      <RiskFigure label="Exit">
        <span data-figure="holder-exit">
          <RiskStrong>
            <code>{exit}</code>
          </RiskStrong>
        </span>
      </RiskFigure>
      {cooldown && (
        <RiskFigure label="Cooldown">
          <span data-figure="holder-cooldown">
            <Prov info={cooldown.prov}>{cooldown.text}</Prov>
          </span>
        </RiskFigure>
      )}
    </Fragment>
  );
}

/** The same clusters with no card to ride — drawn where the CENSUS has no row
 *  for this address and there is therefore no card at all. Left-aligned rather
 *  than the strip's right, because nothing sits to its left to anchor it, and
 *  the sentence above it says why the card is absent. The redeemable statement
 *  is a reading of the chain at this page's block and must not be lost to a
 *  fact about a daily sweep. */
export function VaultContextStripStandalone({ absence, ...strip }: VaultContextStripProps & { absence: string }) {
  return (
    <div className="mb-6" data-position-card-absent>
      <p className="max-w-3xl text-[13px] leading-relaxed text-rb-500">{absence}</p>
      <div className="mt-2 flex flex-col items-start gap-1 text-left">
        <VaultContextStrip {...strip} />
      </div>
    </div>
  );
}
