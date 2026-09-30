"use client";

// PWN loan card — the chain-state analog of the Spark / Morpho / Maker position
// cards, through the SAME shared grammar (OpenPositionStats + StatValue) so it
// lines up with the other explorers.
//
// A PWN "position" is a DISCRETE fixed-term loan, not a pooled account: one
// loan_id, two fixed parties (lender advances credit, borrower locks collateral),
// and economics fixed at creation. Every headline value is read from the chain — the
// collateral, the credit principal and the repay total are the SimpleLoan terms
// captured on-chain. There is no health factor, no USD, no liquidation price — a
// fixed-term loan has none; they'd be interpreted figures, absent from this baseline.

import { OpenPositionStats } from "@/components/shared/open-position-stats";
import { ClosedPositionStats } from "@/components/shared/closed-position-stats";
import { PositionCardMeta } from "@/components/shared/position-card-meta";
import { BookmarkToggle } from "@/components/shared/bookmark-toggle";
import { WalletPill } from "@/components/shared/wallet-pill";
import { StatValue, StatFootnote, StatDash } from "@/components/shared/stat-value";
import { AssetAmount } from "@/components/shared/asset-amount";
import { TokenAmountNotLoaded } from "@/components/shared/not-loaded";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { PositionCardShell } from "@/components/shared/position-card-shell";
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
import { formatNumber } from "@/lib/utils/format";
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

/** A fungible amount in `asset`, or "Not loaded" where its decimals did not
 *  load (the amount has no known scale). Stated in full to three decimals, the
 *  rows' rounding, so the card and the rows print one figure ("3,239.365"). */
function FungibleAmount({ asset, value }: { asset: PwnAsset; value: number }) {
  return asset.decimalsUnread ? (
    <TokenAmountNotLoaded address={asset.address} label={asset.symbol} />
  ) : (
    <AssetAmount value={value} symbol={asset.symbol} display={formatNumber(value)} />
  );
}

/** An asset value: an NFT reads "SYMBOL #id", a fungible token reads amount+symbol.
 *  An NFT contract with no on-chain name (ERC-1155 has no symbol()/name()) has
 *  only its address for an identity — render that as a mono identifier, not
 *  styled like a token symbol (the category footnote below the stat says what
 *  kind of thing it is). Wrapped in its provenance when one is supplied. */
function AssetValue({ asset, prov }: { asset: PwnAsset | null; prov?: Provenance }) {
  if (!asset) return <StatDash />;
  const isNft = asset.category === "ERC721" || asset.category === "ERC1155";
  const inner =
    isNft && asset.tokenId != null ? (
      asset.named ? (
        <StatValue title={`${asset.symbol} #${asset.tokenId}`}>
          <span className="tabular-nums">
            {asset.symbol} <span className="text-rb-500">#{shortTokenId(asset.tokenId)}</span>
          </span>
        </StatValue>
      ) : (
        <StatValue title={`${asset.address} #${asset.tokenId}`} color="text-foreground/60">
          <span className="font-mono text-[0.85em]">{asset.symbol}</span>{" "}
          <span className="text-rb-500">#{shortTokenId(asset.tokenId)}</span>
        </StatValue>
      )
    ) : (
      <StatValue>
        <FungibleAmount asset={asset} value={asset.amount} />
      </StatValue>
    );
  return prov ? <Prov info={prov}>{inner}</Prov> : inner;
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
      for (const a of list) parts.push(`${a.amount.toLocaleString("en-US")} ${a.symbol}`);
    } else if (list.length === 1 && first.amount <= 1) {
      parts.push(`${first.symbol}${first.tokenId != null ? ` #${shortTokenId(first.tokenId)}` : ""}`);
    } else {
      const count = list.reduce((n, a) => n + Math.max(1, a.amount), 0);
      parts.push(`${count}× ${first.symbol}`);
    }
  }
  return parts.join(", ");
}

/** The collateral stat's footnote: the resolved bundle contents when the chain
 *  overlay supplied them; else the ERC category for an unnamed NFT contract
 *  (whose value line is a bare address identifier). */
function collateralFootnote(v: PwnPositionView) {
  const c = v.collateral;
  if (!c) return undefined;
  if (v.bundleContents && v.bundleContents.length > 0 && c.tokenId != null) {
    const detail = v.bundleContents
      .map((a) => `${a.symbol}${a.tokenId != null ? ` #${a.tokenId}` : ""} (${a.address})`)
      .join("\n");
    return (
      <StatFootnote title={detail}>
        <Prov info={positionBundleContentsProv(c.tokenId, v.createdBlock)}>
          contains {bundleSummary(v.bundleContents)}
        </Prov>
      </StatFootnote>
    );
  }
  const isNft = c.category === "ERC721" || c.category === "ERC1155";
  if (isNft && !c.named) {
    return <StatFootnote>{c.category === "ERC721" ? "ERC-721" : "ERC-1155"} · unnamed contract</StatFootnote>;
  }
  return undefined;
}

/** The activity cluster: transactions where the count is known, with the events
 *  beside them in the tip, since one transaction can carry two of the loan's
 *  events. */
function LoanActivityMeta({ v }: { v: PwnPositionView }) {
  const txs = v.txCount ?? null;
  return (
    <PositionCardMeta
      lastActivityAt={v.lastActivityAt}
      eventCount={txs ?? v.eventCount}
      eventCountNoun={txs != null ? "transaction" : "event"}
      eventTotal={txs != null ? v.eventCount : undefined}
      countRule={txs != null ? txCountRule(v, txs) : undefined}
    />
  );
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

/** The cost tile's footnote: the interest, and how it was reached. A loan past
 *  its deadline and unclaimed says first that the sum can no longer be repaid. */
function costFootnote(v: PwnPositionView, cost: PwnLoanCost, unclaimed = false): React.ReactNode {
  const sym = v.credit?.symbol ?? "";
  const lapsed = unclaimed ? <>no longer repayable · </> : null;
  if (cost.shape === "fixed") {
    if (!(cost.interest > 0)) return <StatFootnote>{lapsed}no interest</StatFootnote>;
    const ext = v.extensionCount ?? 0;
    return (
      <StatFootnote>
        {lapsed}principal + {formatNumber(cost.interest)} {sym} fixed interest
        {cost.rate ? <> · {interestRateText(cost.rate)}</> : null}
        {ext > 0 ? <> · unchanged by the {ext === 1 ? "extension" : `${ext} extensions`}</> : null}
      </StatFootnote>
    );
  }
  const a = cost.accrual!;
  return (
    <StatFootnote>
      {lapsed}principal + {formatNumber(cost.interest)} {sym} interest · accrues {aprText(a.apr)}
      {cost.basis === "paid" ? <> · to the repayment</> : <> · counted to the deadline</>}
    </StatFootnote>
  );
}

/** The cost as a tile value, traced to its terms (fixed) or to the contract's
 *  accrual sum (accruing). */
function CostValue({ v, cost }: { v: PwnPositionView; cost: PwnLoanCost }) {
  const c = v.credit!;
  const prov =
    cost.shape === "fixed"
      ? v.repayAmount != null
        ? positionRepayProv(c.symbol, v.version)
        : positionInterestProv(c.symbol, v.version)
      : positionAccruedProv(c.symbol, v.version, cost.accrual!, cost.basis === "paid" ? "paid" : "at-deadline");
  return (
    <StatValue>
      <Prov info={prov}>
        <FungibleAmount asset={c} value={cost.total} />
      </Prov>
    </StatValue>
  );
}

export function PwnPositionCard({
  v,
  receipts = false,
  explanation,
  viewHref,
  viewer,
}: {
  v: PwnPositionView;
  receipts?: boolean;
  /** The wallet the page is read from (lowercase). The other party's pill
   *  links to the same loan read from that party's side. */
  viewer?: string;
  /** The card's Explanation section (the loan narrated as it stands now) —
   *  rendered by the shell on the detail surface. */
  explanation?: React.ReactNode;
  /** Copy-this-view control, forwarded straight through to `PositionCardShell`
   *  — the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
}) {
  // The deadline is a struck term like the other three columns, so it renders
  // in every mood. Past it, an open loan is defaulted and waits for the
  // lender's claim (lib/pwn/economics.ts `pwnLoanState`).
  const struckDueAt = loanDueAt(v);
  const dueAt = loanDeadlineAt(v);
  const extended = v.extendedDueAt != null && struckDueAt != null && v.extendedDueAt !== struckDueAt;
  const state = pwnLoanState(v);
  const unclaimed = state === "unclaimed";
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
  // credit went). On the detail page (receipts) each party is a WalletPill
  // whose address opens the same loan from that party's side, with a visible
  // "Read as the lender" switch beside the side the page reads from; the
  // bookmark star rides the borrower pill. On the listing the whole card is
  // already a <Link>, so it keeps compact text (a nested anchor is invalid
  // HTML) with the standalone star.
  const partiesIdentity =
    receipts && (v.lender || v.borrower) ? (
      <span className="flex flex-wrap items-center gap-1.5 text-xs text-rb-500">
        {v.lender && (
          <>
            {role("Lender")}
            <WalletPill
              wallet={v.lender}
              ensName={null}
              filterProtocol="pwn"
              bookmarkProtocol={v.borrower ? undefined : "pwn"}
              {...sideHref(v.lender)}
            />
          </>
        )}
        {v.lender && v.borrower && (
          <span aria-hidden className="text-rb-500">
            →
          </span>
        )}
        {v.borrower && (
          <>
            {role("Borrower")}
            <WalletPill
              wallet={v.borrower}
              ensName={null}
              filterProtocol="pwn"
              bookmarkProtocol="pwn"
              {...sideHref(v.borrower)}
            />
          </>
        )}
        <LoanActivityMeta v={v} />
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
    ) : (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-rb-500 tabular-nums">
        <span className="text-foreground/80">{parties}</span>
        {favWallet && <BookmarkToggle wallet={favWallet} ensName={null} protocol="pwn" />}
        <LoanActivityMeta v={v} />
      </span>
    );
  const leadingIdentity = <span className="text-xs font-semibold text-rb-500">PWN · Loan #{v.loanId}</span>;

  const principalValue = v.credit ? (
    <StatValue>
      <Prov info={positionCreditProv(v.credit.symbol, v.version)}>
        <FungibleAmount asset={v.credit} value={v.credit.amount} />
      </Prov>
    </StatValue>
  ) : (
    <StatDash />
  );
  const principalFootnote = <StatFootnote>advanced by the lender</StatFootnote>;
  const learnMore = pwnPositionContent({
    status: v.status,
    unclaimed,
    struckDueAt,
    extendedDueAt: v.extendedDueAt,
    extensionCount: v.extensionCount ?? 0,
    version: v.version,
    accruing,
  });

  // REPAID / DEFAULTED: the loan is over, so it draws through the shared
  // terminal-card frame like every other closed position — collateral and
  // principal as struck, and in the fourth column what the borrower paid (or,
  // on a default, what the loan owed when its deadline passed).
  if (v.status === "repaid" || v.status === "defaulted") {
    const extra =
      cost && v.credit
        ? {
            label: v.status === "repaid" ? "Repaid" : "Owed at deadline",
            value: (
              <>
                <CostValue v={v} cost={cost} />
                {costFootnote(v, cost)}
              </>
            ),
          }
        : accruing
          ? {
              label: "Interest",
              value: (
                <>
                  <StatValue>
                    <span className="tabular-nums">{aprText(v.accruingInterestApr!)}</span>
                  </StatValue>
                  <StatFootnote>accrues by the minute on the principal</StatFootnote>
                </>
              ),
            }
          : undefined;
    return (
      <PositionCardShell receipts={receipts} explanation={explanation} viewHref={viewHref} learnMore={learnMore}>
        <ClosedPositionStats
          outcome={v.status}
          leadingIdentity={leadingIdentity}
          identity={partiesIdentity}
          // The listing's lastActivityAt is closedAt ?? createdAt (see
          // viewFromSummary) — the best close-time approximation the view
          // carries; there is no separate "closed" field to prefer over it.
          closedAt={v.lastActivityAt ?? undefined}
          collateral={
            <AssetValue
              asset={v.collateral}
              prov={v.collateral ? positionCollateralProv(v.collateral.symbol, v.version) : undefined}
            />
          }
          collateralFootnote={collateralFootnote(v)}
          debtLabel="Principal"
          debt={principalValue}
          debtFootnote={principalFootnote}
          collateralLabel={CARD_VOCAB.collateral}
          extra={extra}
        />
      </PositionCardShell>
    );
  }

  // The two-axis pill rule: the listing carries the lifecycle pill, the detail
  // page a mode word. A running loan is green OPEN / "Running"; past its
  // deadline it is defaulted, in the default colour, until the lender claims.
  const pill = receipts ? (
    <span
      className={`font-bold px-2 py-0.5 rounded-sm text-xs ${
        unclaimed ? "bg-red-500/20 text-red-500" : "bg-rb-300 dark:bg-rb-700 text-foreground/80 dark:text-foreground/60"
      }`}
    >
      {unclaimed ? "Defaulted, not yet claimed" : "Running"}
    </span>
  ) : unclaimed ? (
    <span className="font-bold tracking-wider px-2 py-0.5 rounded-xs text-xs bg-red-500/20 text-red-500">
      {UNCLAIMED_PILL}
    </span>
  ) : (
    <span className="font-bold tracking-wider px-2 py-0.5 rounded-xs text-xs bg-positive/20 text-positive">OPEN</span>
  );

  return (
    <PositionCardShell receipts={receipts} explanation={explanation} viewHref={viewHref} learnMore={learnMore}>
      <OpenPositionStats
        statusPill={pill}
        leadingIdentity={leadingIdentity}
        identity={partiesIdentity}
        columns={[
          {
            label: "Collateral",
            value: (
              <AssetValue
                asset={v.collateral}
                prov={v.collateral ? positionCollateralProv(v.collateral.symbol, v.version) : undefined}
              />
            ),
            footnote: collateralFootnote(v),
          },
          { label: "Principal", value: principalValue, footnote: principalFootnote },
          {
            // Past the deadline the contract refuses a repayment, so the sum is
            // what the loan owed when it lapsed, never a figure to repay.
            label: unclaimed ? "Owed at the deadline" : cost?.shape === "accruing" ? "Owed at deadline" : "Repay",
            value: cost && v.credit ? <CostValue v={v} cost={cost} /> : <StatDash />,
            footnote: cost ? costFootnote(v, cost, unclaimed) : undefined,
          },
          {
            label: "Due",
            value:
              dueAt != null ? (
                <StatValue title={dueDateTitle(dueAt)}>
                  <Prov
                    info={
                      extended ? extendedDeadlineProv({ loanId: v.loanId, version: v.version }) : bookDueProv(v.dueKind)
                    }
                  >
                    <span className="tabular-nums">{dueDateText(dueAt)}</span>
                  </Prov>
                </StatValue>
              ) : (
                <StatDash />
              ),
            footnote: unclaimed ? (
              <StatFootnote>
                <Prov info={bookPastDueProv()}>defaulted then, not yet claimed by the lender</Prov>
              </StatFootnote>
            ) : extended && struckDueAt != null ? (
              <StatFootnote>extended from {dueDateText(struckDueAt)}</StatFootnote>
            ) : undefined,
          },
        ]}
      />
    </PositionCardShell>
  );
}

/** The listing pill of a loan past its deadline that no one has claimed. */
export const UNCLAIMED_PILL = "DEFAULTED · UNCLAIMED";

export { viewFromSummary };
