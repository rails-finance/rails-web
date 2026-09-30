// Serialize a PWN loan + its timeline into a plain-Markdown snapshot, suitable
// for pasting into an LLM ("here's my loan — what am I looking at?"). Sibling
// of lib/fluid/position-to-markdown.ts, re-grounded in PWN's shape: a position
// is ONE discrete fixed-term loan whose economics were struck at origination
// (the SimpleLoan LOANTerms captured on-chain), so instead of live balances
// and risk lines the snapshot carries the fixed terms, the due clock, and the
// lifecycle the chain recorded. PWN has no oracle, no health factor and no
// liquidation — the preamble says so, so an LLM doesn't invent them. A PURE
// function of the data already in scope on the detail page — no fetching.

import { NOT_LOADED_CELL, unreadToken } from "@/lib/shared/decimals-unread";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isPwnEvent } from "@/lib/shared/types/event-shape";
import type { PwnPositionView } from "@/components/protocol/pwn/pwn-position-card";
import type { PwnAsset } from "@/lib/sources/api/pwn-positions";
import { simpleLoanFor } from "@/lib/pwn/asset-catalog";
import { interestRateText, loanInterestRate } from "@/lib/pwn/economics";
import { amt, fmtUtc, txCell } from "@/lib/shared/position-markdown";
import { markdownTimelineSlice, type MarkdownHistoryScope } from "@/lib/shared/markdown-history";

export interface PwnPositionMarkdownArgs {
  /** What `events` covers, when the page drew a window over a longer history.
   *  Absent means `events` IS the whole history and answers for itself. */
  history?: MarkdownHistoryScope;
  view: PwnPositionView;
  /** Chronologically sorted (oldest → newest) events of THIS loan only. */
  events: BaseActivityEvent[];
  /** The viewed wallet — names which side of the loan the snapshot is read from. */
  wallet?: string;
  /** When the snapshot was taken (copy time) — passed in so the serializer
   *  stays pure. */
  generatedAt: Date;
}

const STATUS_LINE: Record<PwnPositionView["status"], string> = {
  open: "Open — collateral escrowed, repayment outstanding",
  repaid: "Repaid — the borrower repaid in full and the collateral was released",
  defaulted: "Defaulted — the loan expired unpaid and the lender claimed the collateral",
};

/** "0.24 WETH" for a fungible asset, "PIRATE #420 (ERC-721)" for an NFT. */
function assetText(a: PwnAsset | null): string {
  if (!a) return "—";
  const isNft = a.category === "ERC721" || a.category === "ERC1155";
  if (isNft && a.tokenId != null) {
    const name = a.named ? a.symbol : `${a.symbol} (unnamed contract)`;
    const count = a.amount > 1 ? `${a.amount}× ` : "";
    return `${count}${name} #${a.tokenId} (${a.category === "ERC721" ? "ERC-721" : "ERC-1155"}, contract ${a.address})`;
  }
  if (a.decimalsUnread) return notLoaded(a);
  return `${amt(a.amount)} ${a.symbol}`;
}

/** A fungible token whose decimals did not load has no known scale: the export
 *  names the token and its address and states no amount, as the card does. */
function notLoaded(a: PwnAsset): string {
  return `not loaded ${a.symbol} (the chain didn't answer for this token's decimals, ${a.address})`;
}

export function pwnPositionToMarkdown(args: PwnPositionMarkdownArgs): string {
  const { view, events, wallet, generatedAt } = args;
  const creditSym = view.credit?.symbol ?? "credit token";
  const contract = simpleLoanFor(view.version);
  const lines: string[] = [];

  lines.push(`# PWN loan #${view.loanId} (${view.status})`);
  lines.push("");
  lines.push(
    `> Point-in-time snapshot generated ${fmtUtc(generatedAt.getTime() / 1000)}. ` +
      `PWN is a peer-to-peer fixed-term loan protocol: the two parties set every term at origination and the ` +
      `${contract.name} contract records them on-chain (the LOANTerms struct this snapshot is read from). There is ` +
      `NO protocol oracle, NO health factor and NO liquidation — those surfaces don't exist in the protocol; a loan ` +
      `that expires unpaid simply defaults and the lender claims the escrowed collateral. Every value below is in ` +
      `the loan's own tokens; no USD is stated anywhere. Not financial advice.`,
  );
  lines.push("");

  // ── The loan ──
  lines.push(`## Loan terms (fixed at origination)`);
  lines.push("");
  lines.push(`- **Contract:** ${contract.name} (${contract.address})`);
  if (view.lender) {
    const isViewer = wallet != null && view.lender === wallet;
    lines.push(`- **Lender:** ${view.lender}${isViewer ? " ← the viewed wallet" : ""}`);
  }
  if (view.borrower) {
    const isViewer = wallet != null && view.borrower === wallet;
    lines.push(`- **Borrower:** ${view.borrower}${isViewer ? " ← the viewed wallet" : ""}`);
  }
  lines.push(`- **Collateral (escrowed with the loan contract):** ${assetText(view.collateral)}`);
  if (view.bundleContents && view.bundleContents.length > 0) {
    lines.push(
      `- **Bundle contents** (PWN's own Token Bundler ERC-1155 wraps several assets into one collateral token; ` +
        `read from the bundler's tokensInBundle at the loan's creation block):`,
    );
    for (const a of view.bundleContents) {
      const isNft = a.category === "ERC721" || a.category === "ERC1155";
      lines.push(
        `  - ${isNft && a.tokenId != null ? `${a.amount > 1 ? `${a.amount}× ` : ""}${a.symbol} #${a.tokenId}` : `${amt(a.amount)} ${a.symbol}`} (${a.category}, ${a.address})`,
      );
    }
  }
  if (view.credit) lines.push(`- **Credit advanced (principal):** ${assetText(view.credit)}`);
  const rate = loanInterestRate(view);
  if (view.repayAmount != null) {
    lines.push(
      `- **Repayment owed (fixed):** ${view.credit?.decimalsUnread ? notLoaded(view.credit) : `${amt(view.repayAmount)} ${creditSym}`}`,
    );
    if (view.fixedInterest != null && view.fixedInterest > 0)
      lines.push(
        `- **Fixed interest (repayment − principal):** ${amt(view.fixedInterest)} ${creditSym}${rate ? ` (${interestRateText(rate)})` : ""} — set when the loan was struck, it does not accrue`,
      );
  }
  if (view.accruingInterestApr != null && view.accruingInterestApr > 0)
    lines.push(`- **Accruing interest APR:** ${view.accruingInterestApr}`);
  if (
    view.dueKind === "expiration" &&
    view.dueValue &&
    view.extendedDueAt != null &&
    view.extendedDueAt !== Number(view.dueValue)
  )
    lines.push(
      `- **Due (extended):** ${fmtUtc(view.extendedDueAt)}, moved ${view.extensionCount ?? 0} ${(view.extensionCount ?? 0) === 1 ? "time" : "times"} from the struck ${fmtUtc(Number(view.dueValue))} — past this moment an unpaid loan is claimable as defaulted`,
    );
  else if (view.dueKind === "expiration" && view.dueValue)
    lines.push(
      `- **Due (expiration):** ${fmtUtc(Number(view.dueValue))} — past this moment an unpaid loan is claimable as defaulted`,
    );
  else if (view.dueKind === "duration" && view.dueValue)
    lines.push(`- **Duration:** ${Number(view.dueValue).toLocaleString("en-US")} seconds from origination`);
  lines.push(`- **Status:** ${STATUS_LINE[view.status]}`);
  lines.push("");

  lines.push(...timelineTable(events, creditSym, view.repayAmount != null, args.history));
  return lines.join("\n");
}

/** One human line per lifecycle event — what moved, in the loan's own tokens. */
function eventValue(e: BaseActivityEvent, creditSym: string): string {
  if (!isPwnEvent(e)) return "—";
  const d = e.context.data;
  // A credit amount whose decimals did not load reads "not loaded".
  const credit = (v: string) => (unreadToken(e, d.creditAsset ?? d.creditSymbol) ? NOT_LOADED_CELL : amt(Number(v)));
  switch (d.eventType) {
    case "created":
      return d.creditAmount != null
        ? `${credit(d.creditAmount)} ${d.creditSymbol ?? creditSym} advanced to the borrower`
        : "loan struck";
    case "minted":
      return "LOAN note (ERC-721) minted to the lender — the transferable claim on this loan";
    case "paid_back":
      return d.loanRepayAmount != null
        ? `${credit(d.loanRepayAmount)} ${d.creditSymbol ?? creditSym} repaid (principal + fixed interest)`
        : "repaid";
    case "claimed":
      return d.defaulted
        ? `collateral seized by the lender — the loan expired unpaid`
        : d.loanRepayAmount != null
          ? `${credit(d.loanRepayAmount)} ${d.creditSymbol ?? creditSym} collected by the lender`
          : "repayment collected by the lender";
    case "extended":
      return d.extendedDefaultTimestamp != null
        ? `deadline moved${d.originalDefaultTimestamp != null ? ` from ${fmtUtc(Number(d.originalDefaultTimestamp))}` : ""} to ${fmtUtc(Number(d.extendedDefaultTimestamp))}${d.extendedBy ? (d.extendedBy === d.lender ? " by the lender" : " by the LOAN note's holder") : ""}`
        : "loan extended";
    case "burned":
      return "LOAN note burned — the claim is settled and the loan retired";
    default:
      return "—";
  }
}

function timelineTable(
  events: BaseActivityEvent[],
  creditSym: string,
  fixedTotal: boolean,
  history: MarkdownHistoryScope | undefined,
): string[] {
  const out: string[] = [];
  const { rows, heading, firstIndex } = markdownTimelineSlice(events, history, { title: "Lifecycle timeline" });
  out.push(heading);
  out.push("");
  if (rows.length === 0) {
    out.push("_No transaction history available._");
    return out;
  }
  out.push(`| # | Date | Event | What moved | Transaction |`);
  out.push(`|---|------|-------|------------|-------------|`);
  rows.forEach((e, i) => {
    out.push(
      `| ${firstIndex + i} | ${fmtUtc(e.timestamp)} | ${e.actionLabel} | ${eventValue(e, creditSym)} | ${txCell(e)} |`,
    );
  });
  out.push("");
  // The nothing-accrues claim rides the v1.1 proof (a repay total in the
  // terms); a loan whose terms state interest as a rate accrues toward it.
  out.push(
    fixedTotal
      ? "_Every row is a SimpleLoan / LOAN-token event as the chain recorded it. This loan's economics are fixed at " +
          "origination — nothing accrues between events, so the terms above are the loan's whole state._"
      : "_Every row is a SimpleLoan / LOAN-token event as the chain recorded it. This loan's terms state interest as " +
          "a rate, so the amount owed at settlement depends on when repayment lands._",
  );
  out.push("");
  return out;
}
