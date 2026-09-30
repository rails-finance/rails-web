"use client";

// One line under a Compound V2 or Moonwell supply row: whether the row's
// market counted as collateral after it (Comptroller getAssetsIn at the
// row's block) and at what factor. Supplying and entering a market are
// separate steps, so a supply alone may back nothing.

import { useEffect, useState } from "react";
import { Prov } from "@/components/shared/provenance";
import {
  fetchCTokenMembershipAt,
  type CTokenMembershipAt,
  type CTokenProtocol,
} from "@/lib/api/fetch-ctoken-liquidity-at";

export function CTokenMembershipLine(p: {
  protocol: CTokenProtocol;
  brand: string;
  wallet: string;
  block: number;
  market: string;
  symbol: string;
  comptroller: { name: string; address: string };
}) {
  const [m, setM] = useState<CTokenMembershipAt | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    fetchCTokenMembershipAt({ protocol: p.protocol, wallet: p.wallet, block: p.block, market: p.market }).then((r) => {
      if (live) setM(r);
    });
    return () => {
      live = false;
    };
  }, [p.protocol, p.wallet, p.block, p.market]);
  if (!m) return null;
  const info = {
    kind: "chain" as const,
    summary: `Collateral membership — ${p.brand}'s Comptroller listed the markets this account had entered (getAssetsIn) at block ${m.block.toLocaleString("en-US")}; the collateral factor is markets(${p.symbol}) at the same block.`,
    contract: p.comptroller,
    via: `getAssetsIn @ block ${m.block}`,
    verify: { kind: "recompute" as const, text: `Re-run getAssetsIn at block ${m.block} against an archive node` },
  };
  return (
    <p className="px-5 pb-2 text-xs text-rb-500" data-ctoken-membership="">
      {m.entered ? (
        <>
          {p.symbol} was{" "}
          <Prov info={info}>
            <strong>entered as collateral</strong>
          </Prov>{" "}
          at this block
          {m.collateralFactor != null ? (
            <>, counting at {+(m.collateralFactor * 100).toFixed(1)}% of its value</>
          ) : null}
          .
        </>
      ) : (
        <>
          {p.symbol} was{" "}
          <Prov info={info}>
            <strong>not entered as collateral</strong>
          </Prov>{" "}
          at this block: this supply earned the supply rate but backed no borrowing. A liquidation can still seize it.
        </>
      )}
    </p>
  );
}
