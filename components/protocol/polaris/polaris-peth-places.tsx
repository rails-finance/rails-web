"use client";

// Where a Polaris address's pETH sits (C24·polaris; ui-jobs 865): one figure
// for each place, in its unit, each linking to the page that place already
// has, which keeps its card. Beside the card's lozenge in the Lifetime flows
// slot (P2.1), in the position card's frame. The places are in different units
// (pETH, fpETH, vpETH), so the box states no total.

import Link from "next/link";
import type { ReactNode } from "react";
import { SectionSidebar } from "@/components/shared/section-sidebar";
import { Prov, ProvReceiptsScope, useReceiptRegistry, type Provenance } from "@/components/shared/provenance";
import { TokenFigure } from "@/components/shared/token-figure";
import { CARD_PAD_X, INLINE_LINK, SECTION_HEADING } from "@/lib/shared/ui-grammar";
import {
  FPETH,
  PETH,
  POLARIS_MARKET_CONFIG,
  POLARIS_VENUES,
  POLARIS_WETH,
  SVPETH,
  VPETH,
  type PolarisVenueKey,
} from "@/lib/polaris/asset-catalog";
import { polarisDepositHref, polarisLoanHref, polarisPositionHref } from "@/lib/polaris/routes";
import { exactUnits, ZERO, type PethPlaces } from "@/lib/polaris/peth-ledger";
import {
  pethCdpPlaceProv,
  pethHeadProv,
  pethLoanPlaceProv,
  pethLpProv,
  pethSpPlaceProv,
  pethValuedProv,
} from "@/lib/polaris/peth-provenance";
import { RawFigure } from "./polaris-sp-loan-parts";
import { PETH_UNREAD } from "./polaris-peth-card";

function Figure({ raw, symbol, address, info }: { raw: bigint; symbol: string; address: string; info: Provenance }) {
  return (
    <TokenFigure symbol={symbol} address={address} figure={`${exactUnits(raw)} ${symbol}`}>
      <span className="tabular-nums">
        <Prov info={info}>
          <RawFigure raw={raw} symbol={symbol} />
        </Prov>{" "}
        {symbol}
      </span>
    </TokenFigure>
  );
}

function Place({
  id,
  label,
  note,
  figure,
  items,
}: {
  id: string;
  label: string;
  note?: string;
  figure: ReactNode;
  items?: ReactNode[];
}) {
  return (
    <li className="py-2.5 first:pt-0 last:pb-0" data-peth-place={id}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">{label}</div>
          {note && <div className="text-xs text-rb-500">{note}</div>}
        </div>
        <div className="text-sm">{figure}</div>
      </div>
      {items && items.length > 0 && (
        <ul className="mt-1.5 space-y-1 pl-3">
          {items.map((it, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-x-4 text-xs text-rb-500">
              {it}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

const unread = (why: string) => <span className="text-xs text-rb-500">{why}</span>;

export function PolarisPethPlaces({
  places: p,
  headRead,
  headBlock,
}: {
  places: PethPlaces;
  headRead: boolean;
  headBlock: string | null;
}) {
  const registry = useReceiptRegistry();
  const headUnread = unread(headRead ? "Not read" : PETH_UNREAD.head);
  const lpTotal = p.lp.every((x) => x.share != null) ? p.lp.reduce((s, x) => s + (x.share ?? ZERO), ZERO) : null;
  const lpHeld = p.lp.filter((x) => x.lp != null && x.lp > ZERO);
  return (
    <SectionSidebar section="flows">
      <ProvReceiptsScope registry={registry}>
        {/* The Lifetime flows panel's frame and heading row (P2, F1): the
            page's sections read as one family. */}
        <section
          className={`rounded-2xl bg-raised ${CARD_PAD_X} py-4`}
          data-prov-scope="peth-places"
          data-anatomy="C24·polaris"
          aria-labelledby="peth-places-heading"
        >
          <div className="flex min-h-[28px] items-center">
            <h2 id="peth-places-heading" className={`${SECTION_HEADING} text-rb-500`}>
              Where this address&rsquo;s pETH sits
            </h2>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-rb-500">
            The list below gives one figure for each place, in that place&rsquo;s token, and links each CDP, deposit and
            loan to its page.
          </p>
          <ul className="mt-3 divide-y divide-edge-raised">
            <Place
              id="wallet"
              label="In the wallet"
              figure={
                p.wallet != null ? (
                  <Figure
                    raw={p.wallet}
                    symbol={PETH.symbol}
                    address={PETH.address}
                    info={pethHeadProv("pethHeld", headBlock)}
                  />
                ) : (
                  headUnread
                )
              }
            />
            <Place
              id="cdp"
              label="CDP collateral"
              note="At each CDP's last touch."
              figure={
                p.cdp ? (
                  <Figure
                    raw={p.cdp.total}
                    symbol={PETH.symbol}
                    address={PETH.address}
                    info={{
                      kind: "chain-derived",
                      pclass: "emitted",
                      summary:
                        "CDP collateral — the sum of each CDP's collateral at its last touch, for the CDPs this address holds.",
                      formula: "Σ newColl (last CDPUpdated of each CDP held)",
                      via: "GET /api/polaris/peth/<address> · polaris_cdp_updated",
                    }}
                  />
                ) : (
                  unread("Not read")
                )
              }
              items={p.cdp?.items.map((c) => (
                <>
                  <Link href={polarisPositionHref(c.market, c.id)} prefetch={false} className={INLINE_LINK}>
                    {POLARIS_MARKET_CONFIG[c.market].stable.symbol} CDP #{c.id}
                  </Link>
                  <Figure
                    raw={c.raw}
                    symbol={PETH.symbol}
                    address={PETH.address}
                    info={pethCdpPlaceProv(c.market, c.id, c.block, c.tx)}
                  />
                </>
              ))}
            />
            <Place
              id="sp"
              label="Stability Pool deposits"
              note="pETH gains unclaimed at each deposit's last touch. Gains paid in since are not included."
              figure={
                p.sp ? (
                  <Figure
                    raw={p.sp.total}
                    symbol={PETH.symbol}
                    address={PETH.address}
                    info={{
                      kind: "chain-derived",
                      pclass: "emitted",
                      summary:
                        "Stability Pool pETH — the sum of the pETH gains each deposit this address holds left unclaimed at its last touch. pETH paid in since is not counted.",
                      formula: "Σ stashed pETH (last DepositUpdated of each deposit held)",
                      via: "GET /api/polaris/peth/<address> · polaris_sp_deposit_updated",
                    }}
                  />
                ) : (
                  unread("Not read")
                )
              }
              items={p.sp?.items.map((s) => (
                <>
                  <Link href={polarisDepositHref(s.market, s.id)} prefetch={false} className={INLINE_LINK}>
                    {POLARIS_MARKET_CONFIG[s.market].stable.symbol} deposit #{s.id}
                  </Link>
                  <Figure
                    raw={s.raw}
                    symbol={PETH.symbol}
                    address={PETH.address}
                    info={pethSpPlaceProv(s.market, s.id, s.block, s.tx)}
                  />
                </>
              ))}
            />
            <Place
              id="loans"
              label="Reserve-loan collateral"
              note="fpETH, the floor part of pETH, held by the loans."
              figure={
                p.loans ? (
                  <Figure
                    raw={p.loans.total}
                    symbol={FPETH.symbol}
                    address={FPETH.address}
                    info={{
                      kind: "chain-derived",
                      pclass: "indexed",
                      summary:
                        "Reserve-loan collateral — the sum of the fpETH collateral of each open loan this address holds.",
                      formula: "Σ (LoanOpened fpCollateral + Σ LoanAdjusted collChange)",
                      via: "GET /api/polaris/peth/<address> · polaris_loan_opened + polaris_loan_adjusted",
                    }}
                  />
                ) : (
                  unread("Not read")
                )
              }
              items={p.loans?.items.map((l) => (
                <>
                  <Link href={polarisLoanHref(l.id)} prefetch={false} className={INLINE_LINK}>
                    Reserve loan #{l.id}
                  </Link>
                  <Figure raw={l.raw} symbol={FPETH.symbol} address={FPETH.address} info={pethLoanPlaceProv(l.id)} />
                </>
              ))}
            />
            <Place
              id="fpeth"
              label="fpETH in the wallet"
              note="Valued at the floor."
              figure={
                p.fpeth ? (
                  <span className="flex flex-col items-end gap-0.5">
                    <Figure
                      raw={p.fpeth.raw}
                      symbol={FPETH.symbol}
                      address={FPETH.address}
                      info={pethHeadProv("fpethHeld", headBlock)}
                    />
                    {p.fpeth.atFloor != null && p.fpeth.raw > ZERO && (
                      <Figure
                        raw={p.fpeth.atFloor}
                        symbol="ETH"
                        address={POLARIS_WETH.address}
                        info={pethValuedProv("fpethFloor", headBlock)}
                      />
                    )}
                  </span>
                ) : (
                  headUnread
                )
              }
            />
            <Place
              id="lp"
              label="Pool shares"
              note="This address's share of the pETH in three pools. LP tokens staked in another contract are not counted."
              figure={
                lpTotal != null ? (
                  <Figure
                    raw={lpTotal}
                    symbol={PETH.symbol}
                    address={PETH.address}
                    info={{
                      kind: "chain-derived",
                      pclass: "state",
                      summary:
                        "Pool shares — the sum of this address's share of the pETH in the three pools, at the head block.",
                      formula: "Σ balanceOf(address) × pool pETH ÷ totalSupply()",
                      via: "GET /api/polaris/peth/<address> · Multicall3 @ head",
                      source: headBlock ? { block: headBlock } : undefined,
                    }}
                  />
                ) : (
                  headUnread
                )
              }
              items={lpHeld.map((x) => (
                <>
                  <span>{POLARIS_VENUES[x.venue as PolarisVenueKey]?.label ?? x.address}</span>
                  {x.share != null ? (
                    <Figure
                      raw={x.share}
                      symbol={PETH.symbol}
                      address={PETH.address}
                      info={pethLpProv(x.venue as PolarisVenueKey, headBlock)}
                    />
                  ) : (
                    headUnread
                  )}
                </>
              ))}
            />
            <Place
              id="vpeth"
              label="vpETH in the wallet"
              note="The part of pETH above the floor. Splitting one pETH gives one fpETH and one vpETH, and merging them gives the pETH back. Not valued here."
              figure={
                p.vpeth != null ? (
                  <Figure
                    raw={p.vpeth}
                    symbol={VPETH.symbol}
                    address={VPETH.address}
                    info={pethHeadProv("vpethHeld", headBlock)}
                  />
                ) : (
                  headUnread
                )
              }
            />
            <Place
              id="svpeth"
              label="svpETH in the wallet"
              note="vpETH deposited in the svpETH vault, which supplies it to a Morpho Blue market. Shown with the vpETH it converts to. Not valued here."
              figure={
                p.svpeth ? (
                  <span className="flex flex-col items-end gap-0.5">
                    <Figure
                      raw={p.svpeth.raw}
                      symbol={SVPETH.symbol}
                      address={SVPETH.address}
                      info={pethHeadProv("svpethHeld", headBlock)}
                    />
                    {p.svpeth.vpeth != null && p.svpeth.raw > ZERO && (
                      <Figure
                        raw={p.svpeth.vpeth}
                        symbol={VPETH.symbol}
                        address={VPETH.address}
                        info={pethHeadProv("svpethVpeth", headBlock)}
                      />
                    )}
                  </span>
                ) : (
                  headUnread
                )
              }
            />
          </ul>
        </section>
      </ProvReceiptsScope>
    </SectionSidebar>
  );
}
