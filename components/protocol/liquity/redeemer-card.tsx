"use client";

// A Liquity V2 redeemer's card, on the position card shell (P1; the deposit's
// card, sp-deposit-card.tsx, is the sibling): the headlines are the BOLD the
// wallet's redemptions took off Troves' debt, the Troves hit and the
// transactions; the panel states each branch's BOLD and the collateral it paid
// out, in that branch's unit. Every figure covers every row of the wallet
// (rails-server GET /api/liquity-v2/redeemer/:address, totals).

import { useState, type ReactNode } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import {
  PositionCard,
  type PositionCardHead,
  type PositionCardSlots,
  type PositionPanelRow,
} from "@/components/shared/position-card";
import { Prov } from "@/components/shared/provenance";
import { ToolsMenuItem } from "@/components/shared/tools-menu";
import { ListingTag } from "@/components/shared/listing-tag";
import { positionName } from "@/lib/shared/position-name";
import { TOKEN_ADDRESSES } from "@/lib/shared/token-addresses";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";
import { big, exactUnits } from "@/lib/liquity-v2/sp-math";
import { liquityV2RedeemerHref } from "@/lib/liquity-v2/redeemer-routes";
import { redeemerSumProv } from "@/lib/liquity-v2/redeemer-provenance";
import type { LiquityV2RedeemerResponse } from "@/lib/sources/api/liquity-v2-redeemer";
import { RawFigure, tokenIcon } from "./sp-parts";
import { positionLink } from "@/lib/shared/position-link";

const BOLD = "BOLD";

function RedeemerMenuRows({ address }: { address: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (key: string, value: string) => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  };
  return (
    <>
      <ToolsMenuItem
        icon={copied === "id" ? <Check size={16} /> : <Copy size={16} />}
        title="Redeemer"
        subtitle={copied === "id" ? "Copied" : "Copy the redeemer's address"}
        onClick={() => copy("id", address)}
      />
      <ToolsMenuItem
        icon={copied === "link" ? <Check size={16} /> : <Link2 size={16} className="-rotate-45" />}
        title="Link to this page"
        subtitle={copied === "link" ? "Copied" : "Copy the page's address"}
        onClick={() => copy("link", positionLink(liquityV2RedeemerHref(address)))}
      />
    </>
  );
}

/** A branch's BOLD redeemed and collateral paid out, in their own units; null
 *  where the wallet redeemed nothing on it. */
function branchStats(
  branches: LiquityV2RedeemerResponse["totals"]["branches"],
  c: "WETH" | "wstETH" | "rETH",
  served: string | null,
): { bold: PositionPanelRow; coll: PositionPanelRow } | null {
  const b = branches.find((x) => x.collateral_type === c);
  if (!b) return null;
  const branch = LIQUITY_V2_BRANCHES[c.toLowerCase()];
  const bold = big(b.bold_raw);
  const coll = big(b.coll_raw);
  return {
    bold: {
      id: `bold-${c}`,
      label: `BOLD redeemed on ${c}`,
      asset: { symbol: BOLD, address: TOKEN_ADDRESSES.BOLD, figure: `${exactUnits(bold)} ${BOLD}` },
      value: (
        <Prov info={redeemerSumProv("branchBold", served, c)}>
          <RawFigure raw={bold} symbol={BOLD} />
        </Prov>
      ),
    },
    coll: {
      id: `coll-${c}`,
      label: `${c} paid out of Troves`,
      asset: { symbol: c, address: branch.collateralAddr, figure: `${exactUnits(coll)} ${c}` },
      value: (
        <Prov info={redeemerSumProv("branchColl", served, c)}>
          <RawFigure raw={coll} symbol={c} />
        </Prov>
      ),
    },
  };
}

export function liquityV2RedeemerSlots({
  data,
  lastAt,
  explanation,
}: {
  data: LiquityV2RedeemerResponse;
  /** The newest row's timestamp. */
  lastAt: number | null;
  explanation: ReactNode;
}): PositionCardSlots {
  const t = data.totals;
  const served = data.served_thru_block;
  const boldAddr = TOKEN_ADDRESSES.BOLD;
  const total = big(t.bold_raw);
  const heads: PositionCardHead[] = [
    {
      id: "bold",
      label: "BOLD redeemed",
      value: (
        <Prov info={redeemerSumProv("bold", served)}>
          <RawFigure raw={total} symbol={BOLD} />
        </Prov>
      ),
      assets: tokenIcon(BOLD, boldAddr, total),
    },
    {
      id: "troves",
      label: "Troves hit",
      tier: "measure",
      value: (
        <Prov info={redeemerSumProv("troves", served)} value={String(t.troves_hit)}>
          {t.troves_hit.toLocaleString("en-US")}
        </Prov>
      ),
    },
    {
      id: "transactions",
      label: "Transactions",
      tier: "measure",
      value: (
        <Prov info={redeemerSumProv("transactions", served)} value={String(t.transactions)}>
          {t.transactions.toLocaleString("en-US")}
        </Prov>
      ),
    },
  ];

  // One pair of stats per branch, three branches at most: six, the cap.
  const pairs = [
    branchStats(t.branches, "WETH", served),
    branchStats(t.branches, "wstETH", served),
    branchStats(t.branches, "rETH", served),
  ];
  const left = pairs.flatMap((p) => (p ? [p.bold] : []));
  const right = pairs.flatMap((p) => (p ? [p.coll] : []));

  const name = positionName({ noun: "Redeemer", id: data.address });
  return {
    surface: "detail",
    status: null,
    heads,
    // The redemptions and the wallet as the tag, the deposit card's (ui-jobs 807).
    tag: <ListingTag market="Liquity V2 redemptions" id={data.address} />,
    // The transactions are a headline, with their receipt: the counters state the age alone.
    counters: { lastActivityAt: lastAt, eventCount: null, liquidationCount: null, order: "age-last" },
    name,
    explainer: { body: explanation },
    learnMore: null,
    menu: { leading: () => <RedeemerMenuRows address={data.address} />, noun: "redeemer", exports: null },
    panel: [left, right],
  };
}

export function LiquityV2RedeemerCard(props: Parameters<typeof liquityV2RedeemerSlots>[0]) {
  return <PositionCard slots={liquityV2RedeemerSlots(props)} />;
}
