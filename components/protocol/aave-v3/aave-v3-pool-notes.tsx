"use client";

// The facts about THIS Pool that change how the card's figures should be read,
// stated once under the position's explanation rather than on the card face.
//
// The shared Aave V3 card renders every V3-family deployment through one
// grammar, and its face is deliberately the same everywhere: the mode pill,
// the wallet, collateral, debt, health factor, the risk strip. Two things a
// Base Pool can do are not visible on that face and would be misread without
// a sentence:
//
//   • eMode. While a wallet sits in an eMode category, the CATEGORY's
//     liquidation threshold replaces each reserve's own for every reserve the
//     category counts as collateral — 92% against a reserve's own zero, say.
//     The account figures (and the risk strip's threshold) already reflect
//     that, because the Pool computed them; the reader is told why the number
//     is not the reserve's.
//   • A supply that backs nothing. A reserve whose APPLIED threshold is zero
//     is weighted at zero in the Pool's account arithmetic: a real balance
//     that supports no borrowing. How it enters the collateral TOTAL depends
//     on the Pool version, and the two readings differ, so the prose names
//     which one applies: a V3.2+ Pool adds the balance to the total and
//     weights it at zero; a pre-3.2 Pool (Seamless froze on one) skips it in
//     GenericLogic outright, so a real balance sits beside a total that does
//     not count it.
//   • A frozen market (Seamless). Interest still accrues and the account is
//     still liquidatable, but nothing can be supplied or borrowed — the
//     figures are live and enforced, and none of them is an invitation.
//
// Every figure here is the same chain read the card's receipts describe.

import { explorerUrl, type ChainId } from "@/lib/shared/chains";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { pct } from "@/components/shared/ratio-bar";
import type { AaveV3ChainReserve, AaveV3EMode, AaveV3PositionChainResponse } from "@/lib/api/fetch-aave-v3-position";

/** The threshold the Pool ACTUALLY judges this reserve by for THIS wallet:
 *  the category's while the wallet is in an eMode the reserve belongs to, the
 *  reserve's own otherwise. */
function appliedLt(r: AaveV3ChainReserve, emode: AaveV3EMode | null | undefined): number | null {
  if (emode && r.emodeCollateral) return emode.lt;
  return r.lt;
}

const backsNothing = (lt: number | null | undefined): boolean => lt == null || lt === 0;

export interface AaveV3FrozenMarket {
  chainId: ChainId;
  tx: string;
  block: number;
  date: string;
}

export function AaveV3PoolNotes({
  chain,
  collateralAccounting,
  frozen,
}: {
  chain: AaveV3PositionChainResponse;
  /** How this Pool's GenericLogic treats a zero-threshold supply — see the
   *  header. Which one applies is a fact of the deployment, not of the wallet. */
  collateralAccounting: "v3.2+" | "pre-3.2";
  /** Present when every reserve on this Pool is frozen. */
  frozen?: AaveV3FrozenMarket;
}) {
  const emode = chain.emode ?? null;
  const held = chain.reserves.filter((r) => r.supplyBalanceRaw !== "0");
  const inert = held.filter((r) => backsNothing(appliedLt(r, emode)));
  const items: React.ReactNode[] = [];

  if (emode) {
    const covered = held.filter((r) => r.emodeCollateral).map((r) => r.symbol);
    items.push(
      <span key="emode">
        This wallet is in the <H>{emode.label}</H> eMode category, so the Pool judges every reserve that category counts
        as collateral{covered.length > 0 ? <> ({covered.join(", ")} here)</> : null} at the category&rsquo;s own{" "}
        <H>{pct(emode.lt)}</H> liquidation threshold rather than each reserve&rsquo;s. The account figures above already
        reflect that; reserves outside the category keep their own threshold.
      </span>,
    );
  }

  if (inert.length > 0) {
    const names = inert.map((r) => r.symbol).join(", ");
    items.push(
      <span key="inert">
        The supplied <H>{names}</H> backs nothing: the Pool weights{" "}
        {inert.length === 1 ? "this reserve" : "these reserves"} at a zero liquidation threshold, so however large the
        balance it supports no borrowing.{" "}
        {collateralAccounting === "v3.2+"
          ? "It is inside the collateral total above but contributes nothing to the health factor."
          : "This Pool's account arithmetic excludes it from collateral outright, which is why a real balance can sit beside a collateral total that does not count it."}{" "}
        It is still the wallet&rsquo;s to withdraw.
      </span>,
    );
  }

  if (frozen) {
    items.push(
      <span key="frozen">
        Every reserve on this Pool has been frozen since{" "}
        <a
          href={explorerUrl(frozen.chainId, "tx-logs", frozen.tx)}
          target="_blank"
          rel="noopener noreferrer"
          className="link-external"
        >
          one transaction
        </a>{" "}
        at block {frozen.block.toLocaleString("en-US")} ({frozen.date}). Interest still accrues and the account is still
        liquidatable below a health factor of 1.000, so the figures above are live — but nothing can be supplied or
        borrowed here, and this position can only be repaid, withdrawn or liquidated.
      </span>,
    );
  }

  if (items.length === 0) return null;
  return <ProseExplainer items={items} />;
}
