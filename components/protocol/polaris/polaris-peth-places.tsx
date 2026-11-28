"use client";

// Where a Polaris address's pETH sits (C24·polaris; ui-jobs 865): one figure
// for each place, in its unit, each linking to the page that place already
// has, which keeps its card. Beside the card's lozenge in the Lifetime flows
// slot (P2.1), in the position card's frame. The places are in different units
// (pETH, fpETH, vpETH), so the box states no total. Each CDP, deposit, loan,
// pool and the svpETH vault carries "N events →" (C24.1·polaris; ui-jobs
// 872), which narrows the timeline to that place's rows on the Place axis.

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
import type { PethPlace } from "@/lib/sources/api/polaris-peth";
import {
  pethCdpPlaceProv,
  pethHeadProv,
  pethLoanPlaceProv,
  pethLpProv,
  pethSpPlaceProv,
  pethValuedProv,
} from "@/lib/polaris/peth-provenance";
import { RawFigure } from "./polaris-sp-loan-parts";
import { pethAsOfWords } from "@/lib/polaris/peth-as-of";
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
  after,
}: {
  id: string;
  label: string;
  note?: string;
  figure: ReactNode;
  items?: ReactNode[];
  /** A line under the note: the place's "N events" link. */
  after?: ReactNode;
}) {
  return (
    <li className="py-2.5 first:pt-0 last:pb-0" data-peth-place={id}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">{label}</div>
          {note && <div className="text-xs text-rb-500">{note}</div>}
          {after}
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

/** What a place's "N events" link needs: the place's row count, the link
 *  that opens the timeline narrowed to it, and the in-page apply. */
export type PethPlaceEvents = (match: (p: PethPlace) => boolean) => {
  rows: number;
  /** The place in a sentence ("USDp CDP #26"), for the link's name. */
  name: string;
  href: string;
  show: () => void;
} | null;

function EventsLink({ events, match }: { events?: PethPlaceEvents; match: (p: PethPlace) => boolean }) {
  const e = events?.(match);
  if (!e) return null;
  return (
    <a
      href={e.href}
      className={`${INLINE_LINK} text-xs`}
      data-anatomy="C24.1·polaris"
      data-peth-place-events={e.rows}
      aria-label={`${e.rows.toLocaleString("en-US")} ${e.rows === 1 ? "event" : "events"} on ${e.name}`}
      onClick={(ev) => {
        if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return;
        ev.preventDefault();
        e.show();
      }}
    >
      {e.rows.toLocaleString("en-US")} {e.rows === 1 ? "event" : "events"} →
    </a>
  );
}

const linkRow = (link: ReactNode, events: ReactNode) => (
  <span className="flex flex-wrap items-baseline gap-x-2">
    {link}
    {events}
  </span>
);

export function PolarisPethPlaces({
  places: p,
  headRead,
  headBlock,
  storedAsOf,
  events,
}: {
  /** The "N events" links' reader; absent, no place carries one. */
  events?: PethPlaceEvents;
  places: PethPlaces;
  headRead: boolean;
  headBlock: string | null;
  /** The head was not read (`ledger.complete` null): the places the stored
   *  index states (CDPs, deposits, loans) are as of its last read. */
  storedAsOf?: boolean;
}) {
  const registry = useReceiptRegistry();
  const asOfWords = pethAsOfWords(storedAsOf === true);
  const asOfReceipt = storedAsOf
    ? " The chain did not answer, so this is the stored index; later changes are not counted."
    : "";
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
            The list below shows one figure for each place, in its token.
          </p>
          <ul className="mt-3 divide-y divide-[var(--edge-raised)]">
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
              note={`At each CDP's last touch${asOfWords}.`}
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
                        "CDP collateral — the sum of each CDP's collateral at its last touch, for the CDPs this address holds." +
                        asOfReceipt,
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
                  {linkRow(
                    <Link href={polarisPositionHref(c.market, c.id)} prefetch={false} className={INLINE_LINK}>
                      {POLARIS_MARKET_CONFIG[c.market].stable.symbol} CDP #{c.id}
                    </Link>,
                    <EventsLink
                      events={events}
                      match={(p) => p.kind === "cdp" && p.market === c.market && p.id === c.id}
                    />,
                  )}
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
              note={`pETH gains unclaimed at each deposit's last touch${asOfWords}. Gains paid in since are not counted.`}
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
                        "Stability Pool pETH — the sum of the pETH gains each deposit this address holds left unclaimed at its last touch. pETH paid in since is not counted." +
                        asOfReceipt,
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
                  {linkRow(
                    <Link href={polarisDepositHref(s.market, s.id)} prefetch={false} className={INLINE_LINK}>
                      {POLARIS_MARKET_CONFIG[s.market].stable.symbol} deposit #{s.id}
                    </Link>,
                    <EventsLink
                      events={events}
                      match={(p) => p.kind === "sp_deposit" && p.market === s.market && p.id === s.id}
                    />,
                  )}
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
              note={`fpETH, the floor part of pETH, held by the loans${asOfWords}.`}
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
                        "Reserve-loan collateral — the sum of the fpETH collateral of each open loan this address holds." +
                        asOfReceipt,
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
                  {linkRow(
                    <Link href={polarisLoanHref(l.id)} prefetch={false} className={INLINE_LINK}>
                      Reserve loan #{l.id}
                    </Link>,
                    <EventsLink events={events} match={(p) => p.kind === "loan" && p.id === l.id} />,
                  )}
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
                  {linkRow(
                    <span>{POLARIS_VENUES[x.venue as PolarisVenueKey]?.label ?? x.address}</span>,
                    <EventsLink events={events} match={(p) => p.kind === "venue" && p.market === x.venue} />,
                  )}
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
              after={<EventsLink events={events} match={(p) => p.kind === "svpeth"} />}
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
