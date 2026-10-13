// One Alchemix V2 position on the shared position card (rails-ops
// TO-DO-position-card 322, 323): the listing row, and the heads and outcome
// its page's card reuses.
//
// EVERY V2 POSITION IS CLOSED, AT 2026-04-02. V2 was wound down that day and
// every figure is the Alchemist's read at the frozen block. The card is a
// closed card: the figures at close as its heads, Closed and the date as its
// outcome, the block under them.
//
// THE DEBT IS SIGNED. A negative debt is credit the account never drew, and is
// stated as credit, never as a negative owed.
//
// THE V3 SUCCESSOR IS A LINK. Where the wallet holds a V3 position on the same
// synthetic, the card links to it by name. No V3 figure is drawn beside a V2
// one, because the two are one obligation at two points in time.

import type { ReactNode } from "react";
import Link from "next/link";
import {
  PositionCard,
  type PositionCardHead,
  type PositionCardListingSlots,
  type PositionCardOutcome,
  type PositionCardStatus,
} from "@/components/shared/position-card";
import { Prov, type Provenance } from "@/components/shared/provenance";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { formatUnitsExact } from "@/lib/utils/format";
import { alchemixPositionName, alchemixV2PositionName } from "@/lib/alchemix/naming";
import type { AlchemixV2PositionSummary } from "@/types/api/alchemix";
import { NotLoaded } from "@/components/shared/not-loaded";
import { AmountText } from "@/components/shared/amount-text";
import { BlockRef } from "@/components/shared/block-ref";
import { AlchemixIdentity, alchemixChip } from "@/components/protocol/alchemix/alchemix-position-card";

/** alUSD and alETH are 18 decimals each, read from the tokens. */
const SYNTHETIC_DECIMALS = 18;

/** "2 Apr 2026", in the house date locale. */
export function closedOn(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export const V2_STATUS: PositionCardStatus = { word: "Closed", tone: "muted" };

export function v2DebtHead(p: AlchemixV2PositionSummary, prov?: Provenance): PositionCardHead {
  const d = p.frozenDebt;
  if (!d) {
    return {
      id: "debt-at-close",
      label: "Debt at close",
      value: (
        <NotLoaded
          className="text-rb-500"
          title="The chain didn't answer for this position's debt at close. It shows once it does."
        />
      ),
    };
  }
  const magnitude = d.raw.replace(/^-/, "");
  const exact = formatUnitsExact(magnitude, SYNTHETIC_DECIMALS);
  const figure = (
    <span title={`${exact} ${p.syntheticSymbol}`}>
      <AmountText value={Math.abs(d.formatted)} format="headline" symbol={p.syntheticSymbol} />
    </span>
  );
  return {
    id: "debt-at-close",
    label: d.sign === "credit" ? "Credit at close" : "Debt at close",
    value: prov ? (
      <Prov info={prov} value={exact} symbol={p.syntheticSymbol}>
        {figure}
      </Prov>
    ) : (
      figure
    ),
    assets: alchemixChip(p.syntheticSymbol),
    sub: d.sign === "credit" ? "credit the account never drew" : undefined,
  };
}

export function v2CollateralHead(
  p: AlchemixV2PositionSummary,
  provFor?: (index: number) => Provenance | undefined,
): PositionCardHead {
  const held = p.collateral.filter((c) => c.underlying && !c.readStale);
  if (held.length === 0) {
    return {
      id: "collateral-at-close",
      label: "Collateral at close",
      value: <span className="text-rb-500">None</span>,
    };
  }
  const lead = held[0];
  const u = lead.underlying!;
  const exact = formatUnitsExact(u.raw, u.decimals);
  const figure = (
    <span title={`${exact} ${u.symbol}`}>
      <AmountText value={u.formatted} format="headline" symbol={u.symbol} />
    </span>
  );
  const prov = provFor?.(p.collateral.indexOf(lead));
  const rest = held.length - 1;
  return {
    id: "collateral-at-close",
    label: "Collateral at close",
    value: prov ? (
      <Prov info={prov} value={exact} symbol={u.symbol}>
        {figure}
      </Prov>
    ) : (
      figure
    ),
    assets: alchemixChip(u.symbol),
    sub: `in ${lead.yieldToken.symbol}${rest > 0 ? `, and ${rest} more ${rest === 1 ? "token" : "tokens"}` : ""}`,
  };
}

/** The V3 position(s) this wallet holds now: links, by name. */
export function v3SuccessorLinks(
  p: AlchemixV2PositionSummary,
  hrefFor: (lineKey: string, tokenId: string) => string,
): ReactNode {
  if (p.v3Successors.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {p.v3Successors.map((s, i) => (
        <span key={`${s.lineKey}:${s.tokenId}`}>
          <Link href={hrefFor(s.lineKey, s.tokenId)} className="link">
            {alchemixPositionName(p.syntheticSymbol, s.tokenId)}
          </Link>
          {i < p.v3Successors.length - 1 ? "," : ""}
        </span>
      ))}
    </span>
  );
}

/** The outcome: Closed on the wind-down date, the frozen block under it, and
 *  "Now on V3" beside it, as links (`links`) or, on a listing row, a count. */
export function v2Outcome(p: AlchemixV2PositionSummary, links?: ReactNode): PositionCardOutcome {
  const n = p.v3Successors.length;
  return {
    word: "Closed",
    dates: [{ at: Date.parse(`${p.closedAt}T00:00:00Z`) / 1000 }],
    footnote: (
      <div className="text-xs mt-0.5 text-rb-500 tabular-nums">
        read at <BlockRef block={p.frozenAtBlock} size={12} />
      </div>
    ),
    extra: {
      label: "Now on V3",
      value: (
        <div className="mt-2 text-sm">
          {n > 0 ? (
            (links ?? (
              <span className="text-lg font-bold text-foreground/80">
                {n} {n === 1 ? "position" : "positions"}
              </span>
            ))
          ) : (
            <span className="text-lg font-bold text-rb-500">None</span>
          )}
          <div className="text-xs mt-0.5 text-rb-500">
            {n > 0 ? "held by this wallet now" : `this wallet holds no V3 position on ${p.syntheticSymbol}`}
          </div>
        </div>
      ),
    },
  };
}

export function v2ListingSlots(p: AlchemixV2PositionSummary, session: SessionProtocol): PositionCardListingSlots {
  return {
    surface: "listing",
    status: V2_STATUS,
    identity: (
      <AlchemixIdentity
        name={alchemixV2PositionName(p.syntheticSymbol, p.account)}
        chain={p.chainName ?? `chain ${p.chainId}`}
        wallet={p.account}
        session={session}
      />
    ),
    heads: [v2DebtHead(p), v2CollateralHead(p)],
    outcome: v2Outcome(p),
    counters: null,
    menu: null,
  };
}

export function AlchemixV2PositionCard({ p, session }: { p: AlchemixV2PositionSummary; session: SessionProtocol }) {
  return <PositionCard slots={v2ListingSlots(p, session)} />;
}
