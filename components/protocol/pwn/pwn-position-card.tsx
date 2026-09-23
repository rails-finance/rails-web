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
} from "@/lib/pwn/event-provenance";
import { loanDueAt } from "@/lib/pwn/economics";
import { shortAddress, shortTokenId } from "@/lib/pwn/asset-catalog";
import { pwnPositionContent } from "@/lib/pwn/position-content";
import type { PwnPositionSummary, PwnAsset } from "@/lib/sources/api/pwn-positions";
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
  /** Indexed event count for the loan (creation + close events). */
  eventCount?: number | null;
  /** What a bundle collateral wrapped — resolved by the detail page's chain
   *  overlay (tokensInBundle at the creation block); undefined on the listing
   *  and while the overlay is in flight. */
  bundleContents?: PwnBundleAsset[];
}

const STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: "OPEN", cls: "bg-positive/20 text-positive" },
  repaid: { label: "REPAID", cls: "bg-rb-300 dark:bg-rb-700 text-foreground/70" },
  defaulted: { label: "DEFAULTED", cls: "bg-red-500/20 text-red-500" },
};

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
        <AssetAmount value={asset.amount} symbol={asset.symbol} />
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

/** "1 Jan 2024" — the deadline as a date; the title carries the exact moment. */
const dueDateText = (unix: number): string =>
  new Date(unix * 1000).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const dueDateTitle = (unix: number): string => {
  const d = new Date(unix * 1000);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
};

export function PwnPositionCard({
  v,
  receipts = false,
  explanation,
  viewHref,
}: {
  v: PwnPositionView;
  receipts?: boolean;
  /** The card's Explanation section (the loan narrated as it stands now) —
   *  rendered by the shell on the detail surface. */
  explanation?: React.ReactNode;
  /** Copy-this-view control, forwarded straight through to `PositionCardShell`
   *  — the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
}) {
  const st = STATUS[v.status] ?? STATUS.open;
  // The deadline is a struck term like the other three columns, so it renders
  // in every mood. Past-due-ness only matters while the loan stands open —
  // PWN's own default condition, ahead of the lender's claim.
  const dueAt = loanDueAt(v);
  const pastDue = v.status === "open" && dueAt != null && dueAt < Date.now() / 1000;
  const parties =
    v.lender && v.borrower
      ? `${shortAddress(v.lender)} → ${shortAddress(v.borrower)}`
      : v.borrower
        ? shortAddress(v.borrower)
        : v.lender
          ? shortAddress(v.lender)
          : "—";
  // Bookmarks key off a wallet; a loan has two parties, so bookmark the
  // borrower (the collateral owner) — the same wallet hrefFor deep-links to —
  // falling back to the lender when there's no borrower.
  const favWallet = v.borrower ?? v.lender;

  // Two presentations of the same two parties (lender → borrower, credit
  // flows), shared by the open and closed branches below. On the detail page
  // (receipts) each party is a WalletPill whose address deep-links to
  // /pwn?q=<addr> — the listing filter matches a loan where the wallet is
  // either party — with the bookmark star riding the borrower pill (the
  // collateral owner; falls back to the lender when there's no borrower). On
  // the listing the whole card is already a <Link>, so it keeps the compact
  // text (a nested anchor is invalid HTML) with the standalone star. The
  // shared meta cluster (last event + event count) rides after the parties —
  // its values are already in the listing payload (closedAt ?? createdAt,
  // eventCount), so it costs no fetch.
  const partiesIdentity =
    receipts && (v.lender || v.borrower) ? (
      <span className="flex flex-wrap items-center gap-1.5 text-xs text-rb-500">
        {v.lender && (
          <WalletPill
            wallet={v.lender}
            ensName={null}
            filterProtocol="pwn"
            bookmarkProtocol={v.borrower ? undefined : "pwn"}
          />
        )}
        {v.lender && v.borrower && (
          <span aria-hidden className="text-rb-500">
            →
          </span>
        )}
        {v.borrower && <WalletPill wallet={v.borrower} ensName={null} filterProtocol="pwn" bookmarkProtocol="pwn" />}
        <PositionCardMeta lastActivityAt={v.lastActivityAt} eventCount={v.eventCount} />
      </span>
    ) : (
      <span className="flex items-center gap-2 text-xs text-rb-500 tabular-nums">
        {parties}
        {favWallet && <BookmarkToggle wallet={favWallet} ensName={null} protocol="pwn" />}
        <PositionCardMeta lastActivityAt={v.lastActivityAt} eventCount={v.eventCount} />
      </span>
    );
  const leadingIdentity = <span className="text-xs font-semibold text-rb-500">PWN · Loan #{v.loanId}</span>;

  // REPAID / DEFAULTED: the loan is over, so it draws through the shared
  // terminal-card frame like every other closed position — collateral +
  // credit at their struck values, no due date (a settled term).
  if (v.status === "repaid" || v.status === "defaulted") {
    return (
      <PositionCardShell
        receipts={receipts}
        explanation={explanation}
        viewHref={viewHref}
        learnMore={pwnPositionContent({ status: v.status })}
      >
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
          debtLabel={CARD_VOCAB.debt}
          debt={
            v.credit ? (
              <StatValue>
                <Prov info={positionCreditProv(v.credit.symbol, v.version)}>
                  <AssetAmount value={v.credit.amount} symbol={v.credit.symbol} />
                </Prov>
              </StatValue>
            ) : (
              <StatDash />
            )
          }
          debtFootnote={<StatFootnote>credit extended</StatFootnote>}
        />
      </PositionCardShell>
    );
  }

  // The two-axis pill rule: the listing carries the lifecycle pill (green
  // OPEN — the roster idiom), the detail page a neutral mode word. For a loan
  // in force that word is the SimpleLoan contract's own status vocabulary
  // ("2 == running … 4 == expired"): "Running" before the deadline, "Expired"
  // past it — an expired loan still stands open on-chain until the lender
  // claims.
  const modeWord = pastDue ? "Expired" : "Running";

  return (
    <PositionCardShell
      receipts={receipts}
      explanation={explanation}
      viewHref={viewHref}
      learnMore={pwnPositionContent({ status: "open" })}
    >
      <OpenPositionStats
        statusPill={
          receipts ? (
            <span className="font-bold px-2 py-0.5 rounded-sm text-xs bg-rb-300 dark:bg-rb-700 text-foreground/80 dark:text-foreground/60">
              {modeWord}
            </span>
          ) : (
            <span className={`font-bold tracking-wider px-2 py-0.5 rounded-xs text-xs ${st.cls}`}>{st.label}</span>
          )
        }
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
          {
            label: CARD_VOCAB.debt,
            value: v.credit ? (
              <StatValue>
                <Prov info={positionCreditProv(v.credit.symbol, v.version)}>
                  <AssetAmount value={v.credit.amount} symbol={v.credit.symbol} />
                </Prov>
              </StatValue>
            ) : (
              <StatDash />
            ),
            footnote: <StatFootnote>credit extended</StatFootnote>,
          },
          {
            label: "Repay",
            value:
              v.repayAmount != null && v.credit ? (
                <StatValue>
                  <Prov info={positionRepayProv(v.credit.symbol, v.version)}>
                    <AssetAmount value={v.repayAmount} symbol={v.credit.symbol} />
                  </Prov>
                </StatValue>
              ) : (
                <StatDash />
              ),
            footnote:
              v.fixedInterest != null && v.fixedInterest > 0 ? (
                <StatFootnote>principal + fixed interest</StatFootnote>
              ) : undefined,
          },
          {
            label: "Due",
            value:
              dueAt != null ? (
                <StatValue title={dueDateTitle(dueAt)}>
                  <Prov info={bookDueProv(v.dueKind)}>
                    <span className="tabular-nums">{dueDateText(dueAt)}</span>
                  </Prov>
                </StatValue>
              ) : (
                <StatDash />
              ),
            footnote: pastDue ? (
              <StatFootnote>
                <Prov info={bookPastDueProv()}>past due — claimable by the lender</Prov>
              </StatFootnote>
            ) : undefined,
          },
        ]}
      />
    </PositionCardShell>
  );
}

/** Build a card view from the listing summary row. */
export function viewFromSummary(s: PwnPositionSummary): PwnPositionView {
  const fixedInterest = s.repayAmount != null && s.credit != null ? Math.max(0, s.repayAmount - s.credit.amount) : null;
  return {
    loanId: s.loanId,
    status: s.status,
    version: s.version,
    lender: s.lender,
    borrower: s.borrower,
    collateral: s.collateral,
    credit: s.credit,
    repayAmount: s.repayAmount,
    repayAmountRaw: s.repayAmountRaw,
    fixedInterest,
    accruingInterestApr: s.accruingInterestApr,
    dueKind: s.dueKind,
    dueValue: s.dueValue,
    createdAt: s.createdAt,
    createdBlock: s.createdBlock,
    lastActivityAt: s.closedAt ?? s.createdAt,
    eventCount: s.eventCount,
  };
}
