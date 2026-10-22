"use client";

// PWN loan card, as a slot builder for the shared position card (rails-ops
// TO-DO-position-card 322): `pwnCardSlots` turns the loan's view into one
// `PositionCardSlots` object, and `PositionCard`
// (components/shared/position-card.tsx) draws it on the loan page and in the
// listing row.
//
// A PWN "position" is a DISCRETE fixed-term loan, not a pooled account: one
// loan_id, two fixed parties (lender advances credit, borrower locks collateral),
// and economics fixed at creation. Every headline value is read from the chain — the
// collateral, the credit principal and the repay total are the SimpleLoan terms
// captured on-chain. There is no health factor, no USD, no liquidation price — a
// fixed-term loan has none; they'd be interpreted figures, absent from this baseline.

import type { ReactNode } from "react";
import {
  PositionCard,
  type PositionCardExports,
  type PositionCardHead,
  type PositionCardSlots,
  type PositionCardStatus,
  type PositionPanelRow,
} from "@/components/shared/position-card";
import type { PositionCardMetaProps } from "@/components/shared/position-card-meta";
import { BookmarkToggle } from "@/components/shared/bookmark-toggle";
import { WalletPill } from "@/components/shared/wallet-pill";
import { StatValue, StatFootnote } from "@/components/shared/stat-value";
import { RevealTip } from "@/components/shared/reveal-tip";
import { AssetAmount } from "@/components/shared/asset-amount";
import { TokenAmountNotLoaded } from "@/components/shared/not-loaded";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import {
  positionCollateralProv,
  positionCreditProv,
  positionRepayProv,
  positionBundleContentsProv,
  bookDueProv,
  bookPastDueProv,
  positionInterestProv,
  positionAccruedProv,
  extendedDeadlineProv,
} from "@/lib/pwn/event-provenance";
import { formatExact } from "@/lib/utils/format";
import { formatCompact } from "@/lib/shared/format-compact";
import { TokenFigure } from "@/components/shared/token-figure";
import {
  aprText,
  interestRateText,
  isAccruing,
  loanCost,
  loanDeadlineAt,
  loanDueAt,
  pwnLoanState,
  viewFromSummary,
  type PwnLoanCost,
} from "@/lib/pwn/economics";
import Link from "next/link";
import { formatDate } from "@/lib/date";
import { shortAddress, shortTokenId } from "@/lib/pwn/asset-catalog";
import { pwnPositionContent } from "@/lib/pwn/position-content";
import type { PwnAsset } from "@/lib/sources/api/pwn-positions";
import type { PwnBundleAsset } from "@/lib/api/fetch-pwn-bundle";
import { PwnMenuRows } from "./pwn-menu-rows";
import { PanelFigure } from "@/components/shared/position-card-panel";

export interface PwnPositionView {
  loanId: string;
  status: "open" | "repaid" | "defaulted";
  version: string | null;
  lender: string | null;
  borrower: string | null;
  collateral: PwnAsset | null;
  credit: PwnAsset | null;
  repayAmount: number | null;
  repayAmountRaw: string | null;
  /** repay − principal (fixed interest), same credit token; null when unknown. */
  fixedInterest: number | null;
  accruingInterestApr: number | null;
  /** v1.2+ terms' fixed part (raw credit units); null on v1.1. */
  fixedInterestRaw?: string | null;
  dueKind: "expiration" | "duration" | null;
  dueValue: string | null;
  /** Loan creation time (unix seconds) — resolves a duration-form deadline. */
  createdAt?: number | null;
  atBlock?: number;
  /** Loan creation block (the bundle-contents read is pinned there). */
  createdBlock?: number | null;
  /** The loan's most recent on-chain event — the close (repay/claim) when one
   *  is indexed, else the creation. Feeds the shared meta cluster. */
  lastActivityAt?: number | null;
  /** The loan's events (creation, custody, extensions, close). */
  eventCount?: number | null;
  /** Distinct transactions behind those events — creation and the LOAN note's
   *  minting share one, as do a claim and the note's burning. Null where the
   *  source carries no count (the listing, before rails-server mig 370). */
  txCount?: number | null;
  /** The deadline the latest extension set (unix seconds); null or absent when
   *  the parties never moved it. */
  extendedDueAt?: number | null;
  /** How many times the deadline moved. */
  extensionCount?: number;
  /** Who sent each extension (lowercase), oldest first. */
  extensionsBy?: string[];
  /** When the borrower repaid (unix seconds), where the page has the loan's
   *  rows; absent on the listing. */
  repaidAt?: number | null;
  /** What a bundle collateral wrapped — resolved by the detail page's chain
   *  overlay (tokensInBundle at the creation block); undefined on the listing
   *  and while the overlay is in flight. */
  bundleContents?: PwnBundleAsset[];
  /** What each of the loan's transactions did, oldest first, where the page
   *  has its rows ("the creation, which also minted the note"). */
  txParts?: string[];
}

/** A fungible amount in `asset` in the compact form ("2.5K"), or "Not
 *  loaded" where its decimals did not load (the amount has no known scale).
 *  `iconSize` 16 in a panel row. */
function FungibleAmount({ asset, value, iconSize }: { asset: PwnAsset; value: number; iconSize?: number }) {
  return asset.decimalsUnread ? (
    <TokenAmountNotLoaded address={asset.address} label={asset.symbol} />
  ) : (
    <AssetAmount value={value} symbol={asset.symbol} address={asset.address} iconSize={iconSize} />
  );
}

/** A panel figure in the loan's credit token: compact, its 16 px icon in
 *  place of the ticker, traced to `prov`. */
function CreditFigure({ asset, value, prov }: { asset: PwnAsset; value: number; prov: Provenance }) {
  return (
    <TokenFigure symbol={asset.symbol} address={asset.address} figure={`${formatExact(value)} ${asset.symbol}`}>
      <Prov info={prov}>{formatCompact(value)}</Prov>
    </TokenFigure>
  );
}

/** An asset value: an NFT reads "SYMBOL #id", a fungible token reads amount+symbol.
 *  An NFT contract with no on-chain name (ERC-1155 has no symbol()/name()) has
 *  only its address for an identity — render that as a mono identifier, not
 *  styled like a token symbol (the panel's Collateral kind row says what kind
 *  of thing it is). Inline: the headline or the panel row around it sets the
 *  type. Wrapped in its provenance when one is supplied. */
function AssetValue({ asset, prov, iconSize }: { asset: PwnAsset; prov?: Provenance; iconSize?: number }) {
  const isNft = asset.category === "ERC721" || asset.category === "ERC1155";
  const inner =
    isNft && asset.tokenId != null ? (
      asset.named ? (
        <RevealTip tip={`${asset.symbol} #${asset.tokenId}`}>
          <span className="tabular-nums">
            {asset.symbol} <span className="text-rb-500">#{shortTokenId(asset.tokenId)}</span>
          </span>
        </RevealTip>
      ) : (
        <RevealTip tip={`${asset.address} #${asset.tokenId}`}>
          <span className="text-foreground/60">
            <span className="font-mono text-[0.85em]">{asset.symbol}</span>{" "}
            <span className="text-rb-500">#{shortTokenId(asset.tokenId)}</span>
          </span>
        </RevealTip>
      )
    ) : (
      <FungibleAmount asset={asset} value={asset.amount} iconSize={iconSize} />
    );
  return prov ? <Prov info={prov}>{inner}</Prov> : inner;
}

/** The bundle's contents grouped by contract, one panel row each: an ERC20 reads
 *  "1,000 USDT", a single NFT "#3599", several of one contract "4×". The values
 *  carry the Token Bundler read's receipt. */
function bundleRows(assets: PwnBundleAsset[], bundleId: string, atBlock?: number | null): PositionPanelRow[] {
  const byContract = new Map<string, PwnBundleAsset[]>();
  for (const a of assets) {
    const list = byContract.get(a.address) ?? [];
    list.push(a);
    byContract.set(a.address, list);
  }
  const prov = positionBundleContentsProv(bundleId, atBlock);
  const tip =
    "One of the assets wrapped inside the bundled collateral, read from the Token Bundler's tokensInBundle view at the block the loan opened.";
  const rows: PositionPanelRow[] = [];
  for (const list of byContract.values()) {
    const first = list[0];
    const make = (key: string, value: string, asset?: PositionPanelRow["asset"]): PositionPanelRow => ({
      id: `bundle-${first.address}-${key}`,
      label: `${first.symbol} in the bundle`,
      tip,
      value: (
        <Prov info={prov}>
          <RevealTip tip={first.address}>{value}</RevealTip>
        </Prov>
      ),
      asset,
    });
    if (first.category === "ERC20") {
      list.forEach((a, i) =>
        rows.push(
          make(String(i), formatCompact(a.amount), {
            symbol: a.symbol,
            address: a.address,
            figure: `${formatExact(a.amount)} ${a.symbol}`,
          }),
        ),
      );
    } else if (list.length === 1 && first.amount <= 1) {
      rows.push(make("0", first.tokenId != null ? `#${shortTokenId(first.tokenId)}` : "1"));
    } else {
      rows.push(make("0", `${list.reduce((n, a) => n + Math.max(1, a.amount), 0)}×`));
    }
  }
  return rows;
}

/** The closed card's collateral note, under its figure: what the bundle
 *  wrapped, once the chain overlay supplied it; else the ERC category for an
 *  unnamed NFT contract (whose value line is a bare address identifier). */
function collateralNote(v: PwnPositionView): ReactNode {
  const c = v.collateral;
  if (!c) return undefined;
  if (v.bundleContents && v.bundleContents.length > 0 && c.tokenId != null) {
    const detail = v.bundleContents
      .map((a) => `${a.symbol}${a.tokenId != null ? ` #${a.tokenId}` : ""} (${a.address})`)
      .join("\n");
    return (
      <RevealTip tip={detail}>
        <Prov info={positionBundleContentsProv(c.tokenId, v.createdBlock)}>
          contains {bundleSummary(v.bundleContents)}
        </Prov>
      </RevealTip>
    );
  }
  const isNft = c.category === "ERC721" || c.category === "ERC1155";
  if (isNft && !c.named) return <>{c.category === "ERC721" ? "ERC-721" : "ERC-1155"} · unnamed contract</>;
  return undefined;
}

/** "PIRATE #3599" / "4× PIRATE" / "1,000 USDT" — bundle contents grouped by
 *  contract, ERC20 amounts formatted, single NFTs named by id. */
function bundleSummary(assets: PwnBundleAsset[]): string {
  const byContract = new Map<string, PwnBundleAsset[]>();
  for (const a of assets) {
    const list = byContract.get(a.address) ?? [];
    list.push(a);
    byContract.set(a.address, list);
  }
  const parts: string[] = [];
  for (const list of byContract.values()) {
    const first = list[0];
    if (first.category === "ERC20") {
      for (const a of list) parts.push(`${formatCompact(a.amount)} ${a.symbol}`);
    } else if (list.length === 1 && first.amount <= 1) {
      parts.push(`${first.symbol}${first.tokenId != null ? ` #${shortTokenId(first.tokenId)}` : ""}`);
    } else {
      const count = list.reduce((n, a) => n + Math.max(1, a.amount), 0);
      parts.push(`${count}× ${first.symbol}`);
    }
  }
  return parts.join(", ");
}

/** The activity counters: transactions where the count is known, with the
 *  events beside them in the tip, since one transaction can carry two of the
 *  loan's events. */
function loanCounters(v: PwnPositionView, detail: boolean): PositionCardMetaProps {
  const txs = v.txCount ?? null;
  return {
    // The foot strip reads transactions, then the age, as every family's does.
    ...(detail ? { order: "age-last" as const } : {}),
    lastActivityAt: v.lastActivityAt,
    eventCount: txs ?? v.eventCount,
    eventCountNoun: txs != null ? "transaction" : "event",
    eventTotal: txs != null ? v.eventCount : undefined,
    countRule: txs != null ? txCountRule(v, txs) : undefined,
  };
}

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const countOf = (n: number, noun: string): string => `${NUMBER_WORDS[n] ?? n} ${noun}${n === 1 ? "" : "s"}`;

/** What this loan's transactions were, after the count in its tip: "The
 *  creation, which also minted the note; four extensions; the repayment; the
 *  note holder's claim, which also burned the note". The page passes the parts
 *  from the loan's rows; the listing, which has none, reads them from the counts. */
function txCountRule(v: PwnPositionView, txs: number): string | undefined {
  let parts = v.txParts;
  if (!parts) {
    const ext = v.extensionCount ?? 0;
    const closing = txs - 1 - ext;
    parts = ["the creation, which also minted the note"];
    if (ext > 0) parts.push(countOf(ext, "extension"));
    if (v.status === "defaulted") parts.push("the lender's claim on the collateral, which also burned the note");
    else if (v.status === "repaid")
      parts.push(
        closing >= 2
          ? "the repayment; the note holder's claim, which also burned the note"
          : v.lastActivityAt != null && v.lastActivityAt !== v.createdAt
            ? "the repayment, which also paid the note holder and burned the note"
            : "the repayment, not yet claimed by the note holder",
      );
  }
  const text = parts.join("; ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "1 Jan 2024" — the deadline as a date; the title carries the exact moment. */
const dueDateText = (unix: number): string => formatDate(unix);

const dueDateTitle = (unix: number): string => {
  const d = new Date(unix * 1000);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
};

/** The closed card's footnote under what was paid or owed: the interest, and
 *  how it was reached (a closed card has no panel to hold them as rows). */
function costFootnote(v: PwnPositionView, cost: PwnLoanCost): ReactNode {
  const sym = v.credit?.symbol ?? "";
  if (cost.shape === "fixed") {
    if (!(cost.interest > 0)) return <StatFootnote>no interest</StatFootnote>;
    const ext = v.extensionCount ?? 0;
    return (
      <StatFootnote>
        principal + {formatCompact(cost.interest)} {sym} fixed interest
        {cost.rate ? <> · {interestRateText(cost.rate)}</> : null}
        {ext > 0 ? <> · unchanged by the {ext === 1 ? "extension" : `${ext} extensions`}</> : null}
      </StatFootnote>
    );
  }
  const a = cost.accrual!;
  return (
    <StatFootnote>
      principal + {formatCompact(cost.interest)} {sym} interest · accrues {aprText(a.apr)}
      {cost.basis === "paid" ? <> · to the repayment</> : <> · counted to the deadline</>}
    </StatFootnote>
  );
}

/** The cost as a figure, traced to its terms (fixed) or to the contract's
 *  accrual sum (accruing). */
function CostFigure({ v, cost }: { v: PwnPositionView; cost: PwnLoanCost }) {
  const c = v.credit!;
  const prov =
    cost.shape === "fixed"
      ? v.repayAmount != null
        ? positionRepayProv(c.symbol, v.version)
        : positionInterestProv(c.symbol, v.version)
      : positionAccruedProv(c.symbol, v.version, cost.accrual!, cost.basis === "paid" ? "paid" : "at-deadline");
  return (
    <Prov info={prov}>
      <FungibleAmount asset={c} value={cost.total} />
    </Prov>
  );
}

/** A rate in words ("8% for 30 days, 97% a year") with its figures marked,
 *  so the words read muted in the panel (ui-jobs 381). */
function RateText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\d[\d.,]*%?)/).map((part, i) => (i % 2 === 1 ? <PanelFigure key={i}>{part}</PanelFigure> : part))}
    </>
  );
}

/** The interest and its rate as panel rows, where the card is open. */
function costRows(v: PwnPositionView, cost: PwnLoanCost): PositionPanelRow[] {
  const sym = v.credit?.symbol ?? "";
  if (cost.shape === "fixed") {
    const rows: PositionPanelRow[] = [
      {
        id: "interest",
        label: "Fixed interest",
        tip: "The interest struck in the loan's terms, the repay total less the principal, read from the PWN contract at creation. Extensions do not change it.",
        value:
          cost.interest > 0 && v.credit ? (
            <CreditFigure
              asset={v.credit}
              value={cost.interest}
              prov={positionInterestProv(v.credit.symbol, v.version)}
            />
          ) : (
            "none"
          ),
      },
    ];
    if (cost.rate)
      rows.push({
        id: "rate",
        label: "Rate",
        tip: "The fixed interest as a rate over the term the parties struck, worked out from the principal and the repay total.",
        value: <RateText text={interestRateText(cost.rate)} />,
      });
    return rows;
  }
  const a = cost.accrual!;
  return [
    {
      id: "interest",
      label: "Interest",
      tip: "The principal times the loan's yearly rate for each whole minute, counted to the deadline while the loan is unpaid and to the repayment once it is paid. The contract refuses a repayment after the deadline, so the sum stops there.",
      value: (
        <>
          {v.credit ? (
            <CreditFigure
              asset={v.credit}
              value={cost.interest}
              prov={positionAccruedProv(v.credit.symbol, v.version, a, cost.basis === "paid" ? "paid" : "at-deadline")}
            />
          ) : (
            <>
              <PanelFigure>{formatCompact(cost.interest)}</PanelFigure> {sym}
            </>
          )}
          {cost.basis === "paid" ? " to the repayment" : " counted to the deadline"}
        </>
      ),
    },
    {
      id: "rate",
      label: "Accrues",
      tip: "The yearly rate in the loan's terms, read from the PWN contract at creation.",
      value: <RateText text={aprText(a.apr)} />,
    },
  ];
}

export interface PwnPositionCardProps {
  v: PwnPositionView;
  /** `detail` on the loan page (receipts, panel, (i)); `listing` in a row. */
  surface?: "detail" | "listing";
  /** The wallet the page is read from (lowercase). The other party's pill
   *  links to the same loan read from that party's side. */
  viewer?: string;
  /** The card's Explanation section (the loan narrated as it stands now) —
   *  rendered by the shell on the detail surface. */
  explanation?: ReactNode;
  /** Copy-this-view control, the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
  /** The ⋮'s export shapes (`pwnExports`). */
  exports?: PositionCardExports | null;
}

/** PWN's slots for the shared position card: the headlines, the panel, the tag,
 *  the ⋮ and the counters, from the loan's view. */
export function pwnCardSlots({
  v,
  surface = "listing",
  viewer,
  explanation,
  viewHref,
  exports,
}: PwnPositionCardProps): PositionCardSlots {
  const detail = surface === "detail";
  // The deadline is a struck term like the other headlines, so it renders in
  // every mood. Past it, an open loan is defaulted and waits for the lender's
  // claim (lib/pwn/economics.ts `pwnLoanState`).
  const struckDueAt = loanDueAt(v);
  const dueAt = loanDeadlineAt(v);
  const extended = v.extendedDueAt != null && struckDueAt != null && v.extendedDueAt !== struckDueAt;
  const unclaimed = pwnLoanState(v) === "unclaimed";
  const cost = loanCost(v);
  const accruing = isAccruing(v);
  // The side the page reads from, and the other one, as a visible switch.
  const side = viewer == null ? null : viewer === v.lender ? "lender" : viewer === v.borrower ? "borrower" : null;
  const other = side === "lender" ? v.borrower : side === "borrower" ? v.lender : null;
  const sideHref = (party: string): { href: string; hrefLabel: string } | undefined =>
    viewer != null && party !== viewer
      ? {
          href: `/ethereum/pwn/${party}?loan=${encodeURIComponent(v.loanId)}`,
          hrefLabel: `Read loan #${v.loanId} from the ${party === v.lender ? "lender" : "borrower"}'s side`,
        }
      : undefined;
  const role = (word: string) => <span className="text-rb-500">{word}</span>;
  const parties =
    v.lender && v.borrower ? (
      <>
        {role("Lender")} {shortAddress(v.lender)} → {role("Borrower")} {shortAddress(v.borrower)}
      </>
    ) : v.borrower ? (
      <>
        {role("Borrower")} {shortAddress(v.borrower)}
      </>
    ) : v.lender ? (
      <>
        {role("Lender")} {shortAddress(v.lender)}
      </>
    ) : (
      "—"
    );
  // Bookmarks key off a wallet; a loan has two parties, so bookmark the
  // borrower (the collateral owner) — the same wallet hrefFor deep-links to —
  // falling back to the lender when there's no borrower.
  const favWallet = v.borrower ?? v.lender;

  // The two parties, each named by its role (lender → borrower, the way the
  // credit went). On the detail page each party is a WalletPill whose address
  // opens the same loan from that party's side, with a visible "Read as the
  // lender" switch beside the side the page reads from; the bookmark star rides
  // the borrower pill. The party the page is read from is on the wallet row
  // above the card (ui-jobs 228), so the card names the other party. On the
  // listing the whole card is already a <Link>, so it keeps compact text (a
  // nested anchor is invalid HTML) with the standalone star, after the loan's
  // number.
  const showLender = v.lender != null && !(side === "lender");
  const showBorrower = v.borrower != null && !(side === "borrower");
  const identity = detail ? (
    v.lender || v.borrower ? (
      <span className="flex flex-wrap items-center gap-1.5 text-xs text-rb-500">
        {showLender && v.lender && (
          <>
            {role("Lender")}
            <WalletPill
              wallet={v.lender}
              ensName={null}
              filterProtocol="pwn"
              bookmark={!(v.borrower || side)}
              {...sideHref(v.lender)}
            />
          </>
        )}
        {showLender && showBorrower && (
          <span aria-hidden className="text-rb-500">
            →
          </span>
        )}
        {showBorrower && v.borrower && (
          <>
            {role("Borrower")}
            <WalletPill
              wallet={v.borrower}
              ensName={null}
              filterProtocol="pwn"
              bookmark={!side}
              {...sideHref(v.borrower)}
            />
          </>
        )}
        {side && other && (
          <span className="basis-full text-[11px] sm:basis-auto">
            read as the {side} ·{" "}
            <Link
              href={`/ethereum/pwn/${other}?loan=${encodeURIComponent(v.loanId)}`}
              className="text-blue-500 hover:underline"
            >
              Read as the {side === "lender" ? "borrower" : "lender"}
            </Link>
          </span>
        )}
      </span>
    ) : undefined
  ) : (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-rb-500 tabular-nums">
      <span className="font-semibold">Loan #{v.loanId}</span>
      <span className="text-foreground/80">{parties}</span>
      {favWallet && <BookmarkToggle wallet={favWallet} ensName={null} />}
    </span>
  );

  const principalFigure = v.credit ? (
    <Prov info={positionCreditProv(v.credit.symbol, v.version)}>
      <FungibleAmount asset={v.credit} value={v.credit.amount} />
    </Prov>
  ) : null;
  const principalSub = "advanced by the lender";
  const principalTip =
    "The credit the lender advanced, from the loan's terms as created. It is fixed for the life of the loan.";
  const collateralFigure = v.collateral ? (
    <AssetValue asset={v.collateral} prov={positionCollateralProv(v.collateral.symbol, v.version)} />
  ) : null;

  const common = { identity, counters: loanCounters(v, detail) };
  const menu = {
    leading: () => (
      <PwnMenuRows
        loanId={v.loanId}
        pagePath={`/ethereum/pwn/${viewer ?? v.borrower ?? v.lender ?? ""}?loan=${encodeURIComponent(v.loanId)}`}
      />
    ),
    exports: exports ?? null,
  };
  const learnMore = pwnPositionContent({
    status: v.status,
    unclaimed,
    struckDueAt,
    extendedDueAt: v.extendedDueAt,
    extensionCount: v.extensionCount ?? 0,
    version: v.version,
    accruing,
  });

  // REPAID / DEFAULTED: the loan is over, so it draws the closed card —
  // collateral and principal as struck, and in the fourth column what the
  // borrower paid (or, on a default, what the loan owed when its deadline passed).
  if (v.status === "repaid" || v.status === "defaulted") {
    const status: PositionCardStatus =
      v.status === "repaid" ? { word: "Repaid", tone: "muted" } : { word: "Defaulted", tone: "danger" };
    const heads: PositionCardHead[] = [
      {
        id: "collateral",
        label: CARD_VOCAB.collateral,
        value: collateralFigure,
        sub: collateralNote(v),
      },
      { id: "principal", label: "Principal", labelTip: principalTip, value: principalFigure, sub: principalSub },
    ];
    const extra =
      cost && v.credit
        ? {
            label: v.status === "repaid" ? "Repaid" : "Owed at deadline",
            value: (
              <>
                <StatValue>
                  <CostFigure v={v} cost={cost} />
                </StatValue>
                {costFootnote(v, cost)}
              </>
            ),
          }
        : accruing
          ? {
              label: "Interest",
              value: (
                <StatValue>
                  <span className="tabular-nums">{aprText(v.accruingInterestApr!)}</span>
                </StatValue>
              ),
            }
          : undefined;
    const outcome = {
      word: status.word,
      // The listing's lastActivityAt is closedAt ?? createdAt (see
      // viewFromSummary) — the best close-time approximation the view carries;
      // there is no separate "closed" field to prefer over it.
      dates: v.lastActivityAt != null ? [{ at: v.lastActivityAt }] : undefined,
      extra,
    };
    if (!detail) return { ...common, surface: "listing", status, menu: null, heads, outcome };
    return {
      ...common,
      surface: "detail",
      status,
      heads,
      outcome,
      explainer: { body: explanation ?? null, viewHref },
      learnMore,
      menu,
    };
  }

  // Past the deadline an open loan is defaulted until the lender claims; a
  // running loan carries no tag.
  const status: PositionCardStatus | null = unclaimed ? { word: "Defaulted · unclaimed", tone: "danger" } : null;
  const heads: PositionCardHead[] = [
    { id: "principal", label: "Principal", labelTip: principalTip, value: principalFigure, sub: principalSub },
    {
      id: "repay",
      // Past the deadline the contract refuses a repayment, so the sum is what
      // the loan owed when it lapsed, never a figure to repay.
      label: unclaimed || cost?.shape === "accruing" ? "Owed at deadline" : "Repay",
      labelTip:
        unclaimed || cost?.shape === "accruing"
          ? "What the loan owes at its deadline: the principal plus the interest to that day. The contract refuses a repayment after it."
          : "The single fixed total, principal plus interest, that the borrower owes by the deadline, from the loan's terms as created.",
      value: cost && v.credit ? <CostFigure v={v} cost={cost} /> : null,
      sub: unclaimed ? "no longer repayable" : undefined,
    },
    {
      id: "due",
      label: "Due",
      labelTip: "The deadline for repayment, from the loan's terms as created or as the latest extension moved it.",
      value:
        dueAt != null ? (
          <RevealTip tip={dueDateTitle(dueAt)}>
            <Prov
              info={extended ? extendedDeadlineProv({ loanId: v.loanId, version: v.version }) : bookDueProv(v.dueKind)}
            >
              <span className="tabular-nums">{dueDateText(dueAt)}</span>
            </Prov>
          </RevealTip>
        ) : null,
      sub: unclaimed ? <Prov info={bookPastDueProv()}>defaulted then, not yet claimed by the lender</Prov> : undefined,
    },
  ];

  if (!detail) return { ...common, surface: "listing", status, menu: null, heads };

  const left: PositionPanelRow[] = [];
  if (v.collateral && collateralFigure) {
    left.push({
      id: "collateral",
      label: CARD_VOCAB.collateral,
      tip: "What the borrower locked for this loan, from the loan's terms as created. The protocol holds it until the loan ends.",
      value: (
        <AssetValue asset={v.collateral} prov={positionCollateralProv(v.collateral.symbol, v.version)} iconSize={16} />
      ),
    });
    const c = v.collateral;
    if (v.bundleContents && v.bundleContents.length > 0 && c.tokenId != null) {
      left.push(...bundleRows(v.bundleContents, c.tokenId, v.createdBlock));
    } else if ((c.category === "ERC721" || c.category === "ERC1155") && !c.named) {
      left.push({
        id: "collateral-kind",
        label: "Collateral kind",
        tip: "The kind of token locked, read from the loan's terms. This contract reports no name on chain, so the card shows its address.",
        value: `${c.category === "ERC721" ? "ERC-721" : "ERC-1155"} · unnamed contract`,
      });
    }
  }
  const right: PositionPanelRow[] = cost ? costRows(v, cost) : [];
  if (extended && struckDueAt != null) {
    right.push({
      id: "extended-from",
      label: "Extended from",
      tip: "The deadline the loan's terms struck. An extension moved it later; the principal and the repay total did not change.",
      value: dueDateText(struckDueAt),
    });
  }

  return {
    ...common,
    surface: "detail",
    status,
    heads,
    panel: [left, right],
    explainer: { body: explanation ?? null, viewHref },
    learnMore,
    menu,
  };
}

/** The PWN loan card: its slots, drawn by the shared card. */
export function PwnPositionCard(props: PwnPositionCardProps) {
  return <PositionCard slots={pwnCardSlots(props)} />;
}

export { viewFromSummary };
