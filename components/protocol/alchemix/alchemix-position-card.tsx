// One Alchemist position on the shared position card (rails-ops
// TO-DO-position-card 322, 323): the listing row here, and the pieces the
// position page's card (alchemist-position-view.tsx) builds its slots from.
//
// THE CARD'S JOB IS TO SAY WHAT IS TRUE AND WHEN IT WAS TRUE. Three rules it
// keeps, each of them a way this protocol's figures can be misread:
//
// 1. THE GRADE IS A SENTENCE, NOT A CHIP. Base and the two Ethereum lines
//    answer differently — Base replays wei-exact from the position's own
//    events, Ethereum reads getCDP at a block, because a redemption moves every
//    open position's debt at once with nothing in the position's events to see
//    (rails-ops decisions/0032). A reader cannot be expected to decode that
//    from a coloured pill, so the route's own plain-words sentence is rendered
//    as given, as the listing card's notice.
//
// 2. EVERY FIGURE CARRIES ITS BLOCK, AND A FIGURE WITHOUT ONE IS NOT SHOWN.
//    `asOfBlock` is typed nullable because the wire types it that way; a null
//    there means the read did not settle, and an amount rendered without the
//    block it belongs to is a number that looks stated and is not. So the
//    amount and the block are drawn from one guard. The listing states each
//    figure's block under it; the position page, whose figures are one
//    reading, names the block once in its notice, and each figure's receipt
//    carries it.
//
// 3. EARMARKED IS SHOWN ONLY AT ITS OWN BLOCK, AND NEVER BESIDE DEBT AS THOUGH
//    THEY SUMMED. On the position page it is a panel row of its own; the
//    listing, which has no panel, leaves it to the page.
//
// There is also no V2 leg on this card and no slot for one. A V3 position is
// what a linked V2 position BECAME, so showing the two debts as one row would
// double count one obligation (rails-ops reference/alchemix-v2-frozen-record.md).

import { ListingTag } from "@/components/shared/listing-tag";
import type { ReactNode } from "react";
import {
  PositionCard,
  type PositionCardHead,
  type PositionCardListingSlots,
  type PositionCardStatus,
} from "@/components/shared/position-card";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { WalletPill } from "@/components/shared/wallet-pill";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import type { SessionProtocol } from "@/lib/shared/sessions";
import type {
  AlchemixAmount,
  AlchemixCollateral,
  AlchemixLiveCollateral,
  AlchemixPositionStatus,
  AlchemixPositionSummary,
  AlchemixUnderlyingValue,
  AlchemixUsdValue,
} from "@/types/api/alchemix";
import { alchemixMarketWord } from "@/lib/alchemix/naming";
import { BlockRef } from "@/components/shared/block-ref";
import { isStableDenominated } from "@/lib/aave-v4/asset-class";
import { DEPEG_BAND } from "@/lib/shared/usd-display";
import { formatCompactTitled } from "@/lib/shared/format-compact";

/** A vault share price at the asset underneath's own precision, up to six
 *  places (1.000934 USDC), so the share count times it gives the value the
 *  card states. */
export function formatSharePrice(price: number, decimals: number): string {
  const digits = Math.min(decimals, 6);
  return price.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** The tag: none while open; the lifecycle word for a closed position, and
 *  the two states only Alchemix has (a position the reducer declined, one on
 *  a read-grade line with no current reading) with the words the listing's
 *  Status facet names them by. */
export function alchemixStatus(status: AlchemixPositionStatus): PositionCardStatus | null {
  if (status === "open") return null;
  if (status === "closed") return { word: "Closed", tone: "muted" };
  if (status === "refused") return { word: "Refused", tone: "muted" };
  return { word: "No current reading", tone: "muted" };
}

/** A headline asset's icon. */
export function alchemixChip(symbol: string): ReactNode {
  return <TokenChipIcon symbol={symbol} size={28} filterable={false} untitled />;
}

/** An amount as a headline figure: the compact form, the exact one on hover,
 *  inside its receipt where the surface has one. */
export function alchemixAmountFigure(a: AlchemixAmount, unit: string, prov?: Provenance): ReactNode {
  const { display, title } = formatCompactTitled(a.formatted);
  const figure = (
    <span title={title} className="tabular-nums">
      {display}
    </span>
  );
  return prov ? (
    <Prov info={prov} value={String(a.formatted)} symbol={unit}>
      {figure}
    </Prov>
  ) : (
    figure
  );
}

/** The figure for an amount whose read did not settle. */
export const NOT_SETTLED = <span className="text-rb-500">Not settled</span>;

/** The collateral's dollar figure, where the card states one. The house rule
 *  for a stablecoin (lib/shared/usd-display.ts): a USDC line priced within
 *  1% of $1 says its figure once, in USDC; anything else carries the dollar
 *  figure on every card. A holding worth less than a cent reads "< $0.01",
 *  never "$0". */
export function collateralUsdText(
  underlying: AlchemixUnderlyingValue | null,
  usd: AlchemixUsdValue | null,
): string | null {
  if (!underlying || !usd) return null;
  if (underlying.symbol && isStableDenominated(underlying.symbol) && Math.abs(usd.pricePerUnit - 1) <= DEPEG_BAND)
    return null;
  if (usd.usd > 0 && usd.usd < 0.01) return "< $0.01";
  return `$${formatCompactTitled(usd.usd).display}`;
}

/** The Deposited headline, on either surface. What a holder recognises is the
 *  asset underneath, so THE UNDERLYING LEADS, its dollar
 *  figure beneath where the card states one, and the share count the position
 *  holds is the line under that.
 *
 *  `myt_share_price` lives only on a reading of the position, so a position
 *  with no reading has no share price, and therefore no underlying and no USD.
 *  That case leads with the share count and says the conversion is not in
 *  hand. It never renders a zero. `block` is the listing's stamp after the
 *  share count; the position page names its block once. */
export function depositedHead(
  c: (AlchemixCollateral | AlchemixLiveCollateral) | null,
  fallbackMytSymbol: string,
  prov?: { shares?: Provenance; underlying?: Provenance; usd?: Provenance },
  block?: ReactNode,
): PositionCardHead {
  const head = { id: "deposited", label: "Deposited" };
  if (!c) return { ...head, value: NOT_SETTLED };
  const myt = c.mytSymbol ?? fallbackMytSymbol;
  const u = c.underlying;
  const shares = (
    <span className="tabular-nums">
      {formatCompactTitled(c.formatted).display} {myt}
    </span>
  );
  const sharesNode = prov?.shares ? (
    <Prov info={prov.shares} value={String(c.formatted)} symbol={myt}>
      {shares}
    </Prov>
  ) : (
    shares
  );
  if (!u) {
    return {
      ...head,
      value: alchemixAmountFigure(c, myt, prov?.shares),
      assets: alchemixChip(myt),
      sub: <>no share price in hand{block}</>,
    };
  }
  const usdText = collateralUsdText(u, c.usd);
  const usd =
    usdText != null ? (
      prov?.usd && c.usd ? (
        <Prov info={prov.usd} value={String(c.usd.usd)}>
          <span className="text-green-400">{usdText}</span>
        </Prov>
      ) : (
        <span className="text-green-400">{usdText}</span>
      )
    ) : undefined;
  return {
    ...head,
    value: alchemixAmountFigure(u, u.symbol ?? "underlying", prov?.underlying),
    assets: alchemixChip(u.symbol ?? "underlying"),
    usd,
    sub: (
      <>
        held as {sharesNode}
        {block}
      </>
    ),
  };
}

/** The identity at the right of the heading (detail) or after the pill
 *  (listing): "alUSD position 1221", the chain, and on a listing the holder. */
export function AlchemixIdentity({
  name,
  chain,
  wallet,
  session,
  prefix,
}: {
  name: string;
  chain: string;
  wallet?: string | null;
  session?: SessionProtocol;
  /** A word before the wallet ("claimed by"). */
  prefix?: string;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
      {/* Not uppercased: the symbol's case is part of its name
          (lib/alchemix/naming.ts). */}
      <span className="font-bold tracking-wide text-foreground/80">{name}</span>
      <span className="text-rb-500">{chain}</span>
      {wallet && session ? (
        <span className="inline-flex items-center gap-1.5 text-rb-500">
          {prefix}
          <WalletPill wallet={wallet} ensName={null} filterProtocol={session} bookmarkProtocol={session} />
        </span>
      ) : null}
    </span>
  );
}

/** A listing's left side: the holder, then the chain. The position's name is
 *  the card's right-end `tag` (AlchemixTag). */
export function AlchemixListingIdentity({
  chain,
  wallet,
  session,
  prefix,
}: {
  chain: string;
  wallet?: string | null;
  session?: SessionProtocol;
  /** A word before the wallet ("claimed by"). */
  prefix?: string;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
      {wallet && session ? (
        <span className="inline-flex items-center gap-1.5 text-rb-500">
          {prefix}
          <WalletPill wallet={wallet} ensName={null} filterProtocol={session} bookmarkProtocol={session} />
        </span>
      ) : null}
      <span className="text-rb-500">{chain}</span>
    </span>
  );
}

/** A listing's right end: the synthetic and the position's id ("alETH", 265). */
export function AlchemixTag({ market, id }: { market: string; id: string }) {
  return <ListingTag market={market} id={id} />;
}

/** " · block 26,186,057": a listing figure's stamp. */
function stamp(block: number | null | undefined): ReactNode {
  return block != null ? (
    <>
      {" · "}
      <BlockRef block={block} size={12} />
    </>
  ) : null;
}

export function alchemixListingSlots(p: AlchemixPositionSummary, session: SessionProtocol): PositionCardListingSlots {
  const sym = p.syntheticSymbol;
  const c = p.figures.collateral;
  const collSettled = c && c.asOfBlock != null ? c : null;
  // The share count and the share price can be read at two blocks; the
  // listing stamps the share count with its own, and the price's after it.
  const priceBlock = collSettled?.underlying?.sharePriceAsOfBlock ?? null;
  const collStamp = collSettled ? (
    <>
      {stamp(collSettled.asOfBlock)}
      {priceBlock != null && priceBlock !== collSettled.asOfBlock ? (
        <>
          , priced at <BlockRef block={priceBlock} size={12} />
        </>
      ) : null}
    </>
  ) : null;
  const debt = p.figures.debt && p.figures.debt.asOfBlock != null ? p.figures.debt : null;
  return {
    surface: "listing",
    status: alchemixStatus(p.status),
    tag: <AlchemixTag market={alchemixMarketWord(sym)} id={p.tokenId} />,
    identity: (
      <AlchemixListingIdentity chain={p.chainName ?? `chain ${p.chainId}`} wallet={p.owner} session={session} />
    ),
    heads: [
      depositedHead(collSettled, "shares", undefined, collStamp),
      {
        id: "debt",
        label: "Debt",
        value: debt ? alchemixAmountFigure(debt, sym) : NOT_SETTLED,
        assets: debt ? alchemixChip(sym) : undefined,
        sub: debt ? <BlockRef block={debt.asOfBlock!} size={12} /> : undefined,
      },
    ],
    // The route's sentence for this line's grade, rendered as given.
    notice: (
      <div className="mb-3 space-y-1.5 text-xs leading-relaxed text-rb-500">
        <p>{p.figures.gradeReason}</p>
        {p.refusedReason ? <p>{p.refusedReason}</p> : null}
      </div>
    ),
    counters: null,
    menu: null,
  };
}

export function AlchemixPositionCard({ p, session }: { p: AlchemixPositionSummary; session: SessionProtocol }) {
  return <PositionCard slots={alchemixListingSlots(p, session)} />;
}
