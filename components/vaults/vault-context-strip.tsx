"use client";

// What is redeemable at this block, which function a holder leaves through,
// and on a stake token the cooldown that decides the first of those — WORDS
// ONLY, with no bars, meters or colour (Miles, 2026-09-09).
//
// On the position card these are rows of the panel's right column
// (`vaultContextRows`, rails-ops TO-DO-position-card 322). Where the census has
// no row for the address there is no card, and the same figures stand alone
// under the sentence that says why (`VaultContextStripStandalone`).
//
// CHAIN-AGNOSTIC BY SHAPE. Ethereum's redeemable figure is `maxRedeem(holder)`
// in share units and Base's is `maxWithdraw(holder)` in asset units, so the
// caller hands in formatted words plus the receipt that traces them. The
// `figure` name travels with the props: a check that reads "what is
// redeemable" reads the name the page's loader answers under.
//
// AN UNREAD CALL IS SAID IN WORDS. `{ unread: true }` prints "Not loaded",
// never a dash or a zero. A zero that was read is a reading and prints as one,
// which on a stake token outside its window is the point.

import { Fragment } from "react";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { RiskFigure, RiskStrong } from "@/components/shared/risk-footer-strip";
import { NotLoaded } from "@/components/shared/not-loaded";
import type { PositionPanelRow } from "@/components/shared/position-card";

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

function VaultContextStrip({ redeemable, exit, cooldown }: VaultContextStripProps) {
  return (
    <Fragment>
      <RiskFigure label="Redeemable now">
        <span data-figure={redeemable.figure}>
          {"unread" in redeemable ? (
            <NotLoaded inline className="" />
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

/** The same figures as rows of the position card's panel. */
export function vaultContextRows({ redeemable, exit, cooldown }: VaultContextStripProps): PositionPanelRow[] {
  const shares = redeemable.figure === "holder-max-redeem";
  return [
    {
      id: "redeemable",
      label: "Redeemable now",
      value: (
        <span data-figure={redeemable.figure}>
          {"unread" in redeemable ? (
            <NotLoaded inline className="" />
          ) : (
            <Prov info={redeemable.prov}>{redeemable.text}</Prov>
          )}
        </span>
      ),
      tip: shares
        ? "The vault's maxRedeem() for this address at the page's block, in shares: what the contract says can be redeemed then."
        : "The vault's maxWithdraw() for this address at the page's block, in the asset: what the markets in its withdraw queue could pay then.",
    },
    {
      id: "exit",
      label: "Exit",
      value: (
        <span data-figure="holder-exit">
          <code>{exit}</code>
        </span>
      ),
      tip: "The vault's functions a holder leaves through, as the contract names them.",
    },
    ...(cooldown
      ? [
          {
            id: "cooldown",
            label: "Cooldown",
            value: (
              <span data-figure="holder-cooldown">
                <Prov info={cooldown.prov}>{cooldown.text}</Prov>
              </span>
            ),
            tip: "The stake token's cooldown for this address, read from the contract at the page's block: redeem() answers only inside its window.",
          },
        ]
      : []),
  ];
}
