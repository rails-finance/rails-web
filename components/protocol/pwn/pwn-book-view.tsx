"use client";

// The PWN protocol view (/pwn/book) — the loan book, whole.
// ----------------------------------------------------------------------------
// The family's other protocol views read a shared thing at one block — a
// market's utilisation, a system's collateral ratio, a register of vaults.
// PWN has no shared thing: no pool, no rate curve, no oracle, no branches.
// The protocol is its loans, each a pairwise fixed-term agreement, so the
// view states what the BOOK is on the protocol's own axes:
//
//   1. The open book — how much of the book stands open and how much of that
//      has already lapsed. The loans themselves are the loan listing's
//      subject, so this links there rather than re-listing them.
//   2. What secures the loans — the book's collateral, grouped by asset, with
//      each asset's outcome record.
//   3. What the loans owe — the credit side per token. Same-token sums ONLY:
//      with no protocol oracle there is no unit to total the book in, and the
//      view says so instead of inventing one.
//   4. The terms the parties fixed — term length and fixed-interest share as
//      distributions, because on PWN every term is negotiated, not curved.
//   5. Defaults & claims — how much of the book ended that way, and a link to
//      those loans in the listing.
//
// Deliberately NOT here: utilisation, rates, health factors, USD — the
// coverage row rules them out ({ why }); this view claims none of them. Nor
// per-loan rows: a protocol view describes the market and links to the listing
// for the positions in it (the Liquity family's branches pages, 2026-08-29).
// Present, don't rank: no score, no risk valence; the only chroma is the
// app's interaction blue on links.

import Link from "next/link";
import { Prov, ProvReceiptsScope, useReceiptRegistry, type Provenance } from "@/components/shared/provenance";
import { VitalsBand } from "@/components/shared/vitals-band";
import {
  bookLoanCountProv,
  bookStatusCountProv,
  bookPrincipalProv,
  bookRepayOwedProv,
  bookCollateralLineProv,
  bookCreditCountProv,
  bookPastDueProv,
  bookTermLengthProv,
  bookInterestShareProv,
} from "@/lib/pwn/event-provenance";
import { formatCompact, formatExact } from "@/lib/utils/format";
import type { PwnLoanBook } from "@/lib/pwn/loan-book";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

const pct = (f: number): string => `${(f * 100).toFixed(1)}%`;
const days = (d: number): string => (d < 1 ? `${(d * 24).toFixed(0)} h` : `${Math.round(d)} d`);

/** The listing selections that reproduce this page's two per-loan lists. The book
 *  states what the book IS; the loans in it are the loan listing's subject, and it
 *  already renders each with its collateral, its credit, the repayment owed and its
 *  deadline. Sorted, these two URLs ARE the lists this page used to draw.
 *
 *  Built from the listing's own param names, so a rename here fails SILENT — the
 *  listing ignores a param it doesn't recognise and serves its default view, which
 *  looks fine and shows the wrong loans. scripts/verify/verify-book-listing-link.mjs
 *  is what catches that. */
const OPEN_BOOK_HREF = "/ethereum/pwn?status=open&sortBy=due&sortOrder=asc";
const DEFAULTS_HREF = "/ethereum/pwn?status=defaulted&sortBy=settled&sortOrder=desc";

const CATEGORY_LABEL: Record<string, string> = { ERC20: "ERC-20", ERC721: "ERC-721", ERC1155: "ERC-1155" };

// ── 1 · The open book ────────────────────────────────────────────────────────

function OpenBookSection({ book }: { book: PwnLoanBook }) {
  const pastDue = book.pastDueOpen;
  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground">The open book</h2>
      <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-rb-500">
        Every loan standing open: created, not yet repaid, not yet claimed. Each holds its borrower&rsquo;s collateral
        in escrow against a fixed repayment in the loan&rsquo;s own credit token. A loan past its deadline has defaulted
        by the clock, and its lender may claim the collateral at any time.
      </p>

      <div className="mt-3 rounded-xl bg-raised px-4 py-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-semibold text-foreground">Open loans</span>
          <span className="text-[11px] tabular-nums text-rb-500">
            <Prov info={bookStatusCountProv("open")}>
              {book.totals.open} {book.totals.open === 1 ? "loan" : "loans"}
            </Prov>
            {pastDue > 0 && (
              <>
                {" "}
                · <Prov info={bookPastDueProv()}>{pastDue} past due</Prov>
              </>
            )}
          </span>
        </div>

        {book.totals.open === 0 ? (
          <p className="mt-2.5 text-[11px] leading-relaxed text-rb-500">
            No loan stands open — every loan ever struck has settled, by repayment or by the lender&rsquo;s claim. The
            rest of this page is the book&rsquo;s record.
          </p>
        ) : (
          <>
            <p className="mt-2.5 text-[11px] leading-relaxed text-rb-500">
              The loans themselves are the listing&rsquo;s subject: filtered to open and ordered by deadline, it states
              each one&rsquo;s collateral, credit, fixed repayment and due date.
            </p>
            <Link href={OPEN_BOOK_HREF} className="mt-2 inline-block text-[13px] text-blue-500 hover:underline">
              Open loans, soonest deadline first <span aria-hidden>→</span>
            </Link>
          </>
        )}
      </div>
    </section>
  );
}

// ── 2 · What secures the loans ───────────────────────────────────────────────

function CollateralSection({ book }: { book: PwnLoanBook }) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-foreground">What secures the loans</h2>
      <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-rb-500">
        The book&rsquo;s collateral, grouped by asset. PWN accepts arbitrary tokens — fungible ERC-20s, single NFTs, and
        the protocol&rsquo;s own Token Bundler wrapper, which rolls several assets into one ERC-1155 bundle (its
        contents are chain-readable and shown on each loan&rsquo;s page). Each line carries the asset&rsquo;s own
        outcome record.
      </p>

      <div className="mt-3 rounded-xl bg-raised px-4 py-3.5">
        <div className="hidden grid-cols-[1fr_6rem_4rem_4rem_4rem_4.5rem] gap-x-3 border-b border-rb-200 pb-1 text-[10px] uppercase tracking-wider text-rb-500 sm:grid dark:border-rb-500/20">
          <span>Asset</span>
          <span>Kind</span>
          <span className="text-right">Loans</span>
          <span className="text-right">Open</span>
          <span className="text-right">Repaid</span>
          <span className="text-right">Defaulted</span>
        </div>
        <div className="divide-y divide-rb-200 dark:divide-rb-500/20">
          {book.collateral.map((c) => (
            <div
              key={c.address}
              className="grid grid-cols-2 items-baseline gap-x-3 gap-y-1 py-2 sm:grid-cols-[1fr_6rem_4rem_4rem_4rem_4.5rem]"
            >
              <div className="text-xs">
                <a
                  href={explorerUrl(MAINNET_CHAIN_ID, "address", c.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-external text-foreground"
                  title={c.address}
                >
                  {c.named ? c.symbol : <span className="font-mono text-[0.85em]">{c.symbol}</span>}
                </a>
                {c.isBundle && <span className="ml-1.5 text-[11px] text-rb-500">the protocol&rsquo;s own wrapper</span>}
                {!c.named && !c.isBundle && <span className="ml-1.5 text-[11px] text-rb-500">unnamed contract</span>}
              </div>
              <div className="text-xs text-rb-500">{c.category ? CATEGORY_LABEL[c.category] : "—"}</div>
              <div className="text-xs tabular-nums text-foreground sm:text-right">
                <Prov info={bookCollateralLineProv(c.symbol)}>{c.loans}</Prov>
              </div>
              <div className="text-xs tabular-nums text-foreground sm:text-right">
                <Prov info={bookCollateralLineProv(c.symbol, "open")}>{c.open}</Prov>
              </div>
              <div className="text-xs tabular-nums text-foreground sm:text-right">
                <Prov info={bookCollateralLineProv(c.symbol, "repaid")}>{c.repaid}</Prov>
              </div>
              <div className="text-xs tabular-nums text-foreground sm:text-right">
                <Prov info={bookCollateralLineProv(c.symbol, "defaulted")}>{c.defaulted}</Prov>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── 3 · What the loans owe ───────────────────────────────────────────────────

function CreditSection({ book }: { book: PwnLoanBook }) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-foreground">What the loans owe</h2>
      <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-rb-500">
        The credit side, per token. Sums stay within one token: PWN has no protocol oracle — the two parties set the
        price between themselves — so there is no unit the whole book could be totalled in, and this view does not
        invent one.
      </p>

      <div className="mt-3 rounded-xl bg-raised px-4 py-3.5">
        <div className="hidden grid-cols-[7rem_4rem_1fr_1fr_1fr] gap-x-3 border-b border-rb-200 pb-1 text-[10px] uppercase tracking-wider text-rb-500 sm:grid dark:border-rb-500/20">
          <span>Token</span>
          <span className="text-right">Loans</span>
          <span className="text-right">Advanced (lifetime)</span>
          <span className="text-right">Outstanding</span>
          <span className="text-right">Owed at settlement</span>
        </div>
        <div className="divide-y divide-rb-200 dark:divide-rb-500/20">
          {book.credit.map((t) => (
            <div
              key={t.address}
              className="grid grid-cols-2 items-baseline gap-x-3 gap-y-1 py-2 sm:grid-cols-[7rem_4rem_1fr_1fr_1fr]"
            >
              <div className="text-xs">
                <a
                  href={explorerUrl(MAINNET_CHAIN_ID, "address", t.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-external text-foreground"
                  title={t.address}
                >
                  {t.named ? t.symbol : <span className="font-mono text-[0.85em]">{t.symbol}</span>}
                </a>
              </div>
              <div className="text-xs tabular-nums text-foreground sm:text-right">
                <Prov info={bookCreditCountProv(t.symbol)}>{t.loans}</Prov>
              </div>
              <div className="text-xs tabular-nums text-foreground sm:text-right">
                <Prov info={bookPrincipalProv(t.symbol, "advanced")} value={formatExact(t.principalAdvanced)}>
                  {formatCompact(t.principalAdvanced)}
                </Prov>
              </div>
              <div className="text-xs tabular-nums sm:text-right">
                {t.open > 0 ? (
                  <Prov info={bookPrincipalProv(t.symbol, "outstanding")} value={formatExact(t.principalOutstanding)}>
                    <span className="text-foreground">{formatCompact(t.principalOutstanding)}</span>
                  </Prov>
                ) : (
                  <span className="text-rb-500">—</span>
                )}
              </div>
              <div className="text-xs tabular-nums sm:text-right">
                {t.repayOwed != null ? (
                  <Prov info={bookRepayOwedProv(t.symbol)} value={formatExact(t.repayOwed)}>
                    <span className="text-foreground">{formatCompact(t.repayOwed)}</span>
                  </Prov>
                ) : (
                  <span className="text-rb-500">—</span>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2.5 text-[11px] leading-relaxed text-rb-500">
          &ldquo;Advanced&rdquo; is every principal ever handed over in the token; &ldquo;outstanding&rdquo; is the
          principal of the loans still open; &ldquo;owed at settlement&rdquo; adds their fixed interest. A dash means no
          open loan in the token — or, for the owed column, an open loan whose terms carry no fixed repay total
          (v1.2/v1.3 terms state interest differently), in which case no partial sum is shown.
        </p>
      </div>
    </section>
  );
}

// ── 4 · The terms the parties fixed ──────────────────────────────────────────

function Spread({
  label,
  value,
  fmt,
  prov,
  note,
}: {
  label: string;
  value: { min: number; median: number; max: number } | null;
  fmt: (x: number) => string;
  prov: Provenance;
  note: string;
}) {
  return (
    <div>
      <div className="text-[11px] text-rb-500">{label}</div>
      <div className="mt-0.5 text-xs tabular-nums text-foreground">
        {value ? (
          <Prov info={prov} value={`${fmt(value.min)} / ${fmt(value.median)} / ${fmt(value.max)}`}>
            {fmt(value.min)} · {fmt(value.median)} · {fmt(value.max)}
          </Prov>
        ) : (
          "—"
        )}
      </div>
      <div className="mt-0.5 text-[11px] leading-relaxed text-rb-500">{note}</div>
    </div>
  );
}

function TermsSection({ book }: { book: PwnLoanBook }) {
  const t = book.terms;
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-foreground">The terms the parties fixed</h2>
      <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-rb-500">
        On PWN nothing prices a loan but its two parties: no rate curve, no utilisation, no floating anything. So the
        book&rsquo;s terms are a distribution, not a curve — each loan&rsquo;s length and interest were negotiated at
        creation and fixed for its life. Stated as shortest · median · longest across the book.
      </p>

      <div className="mt-3 rounded-xl bg-raised px-4 py-3.5">
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
          <Spread
            label="Term length"
            value={t.termDays}
            fmt={days}
            prov={bookTermLengthProv()}
            note="Each loan's deadline minus its creation, over every loan whose terms state both."
          />
          <Spread
            label="Fixed interest over principal"
            value={t.interestShare}
            fmt={pct}
            prov={bookInterestShareProv()}
            note={`(repay − principal) ÷ principal, over the ${t.loansWithFixedTotal} ${
              t.loansWithFixedTotal === 1 ? "loan" : "loans"
            } whose terms carry a fixed repay total.`}
          />
        </div>
        {t.accruingLoans > 0 && (
          <p className="mt-2.5 text-[11px] leading-relaxed text-rb-500">
            {t.accruingLoans} {t.accruingLoans === 1 ? "loan carries" : "loans carry"} an accruing rate instead of a
            fixed total (the v1.2/v1.3 terms shape); their interest is stated per year, not as a repay figure, so they
            sit outside the fixed-interest spread above.
          </p>
        )}
      </div>
    </section>
  );
}

// ── 5 · Defaults & claims ────────────────────────────────────────────────────

function DefaultsSection({ book }: { book: PwnLoanBook }) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-foreground">Defaults &amp; claims</h2>
      <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-rb-500">
        A PWN default is a clock event, not a price event: a loan that expires unpaid simply lapses, and the lender
        claims the escrowed collateral — whatever it is then worth. Nothing is liquidated, no penalty is computed, and
        no third party takes part.
      </p>

      <div className="mt-3 rounded-xl bg-raised px-4 py-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-semibold text-foreground">Settled by default</span>
          <span className="text-[11px] tabular-nums text-rb-500">
            <Prov info={bookStatusCountProv("defaulted")}>
              {book.totals.defaulted} of {book.totals.loans} {book.totals.loans === 1 ? "loan" : "loans"}
            </Prov>
          </span>
        </div>

        {book.totals.defaulted === 0 ? (
          <p className="mt-2.5 text-[11px] leading-relaxed text-rb-500">
            No loan in the book has lapsed — every settled loan was repaid.
          </p>
        ) : (
          <>
            <p className="mt-2.5 text-[11px] leading-relaxed text-rb-500">
              Which loans lapsed, what each lender took and what repayment it lapsed on is the listing, filtered to
              defaulted and ordered by the date the claim settled.
            </p>
            <Link href={DEFAULTS_HREF} className="mt-2 inline-block text-[13px] text-blue-500 hover:underline">
              Loans settled by default, most recent first <span aria-hidden>→</span>
            </Link>
          </>
        )}
      </div>
    </section>
  );
}

// ── The view ─────────────────────────────────────────────────────────────────

export function PwnBookView({ book }: { book: PwnLoanBook }) {
  const registry = useReceiptRegistry();

  if (book.stale) {
    return (
      <div className="py-12 text-center text-rb-500">
        <p className="mb-1">Couldn&apos;t read the loan book from the indexed backend.</p>
        <p className="text-sm">
          This view reduces the explorer&rsquo;s own loan index and has no cached fallback — rather than show a partial
          book, it shows nothing. Try again shortly.
        </p>
      </div>
    );
  }

  return (
    <ProvReceiptsScope registry={registry}>
      {/* The vitals band. Only the population slot is filled, and that is the
          whole of what PWN can state at the book level: there is no pool and
          no roster of markets to count, and with no protocol oracle — the two
          parties price each loan between themselves — there is no unit the
          book could be totalled in, so the size slots and any usage ratio
          would have to be invented. Same-token sums only, per section below.
          Do not add a USD total here. */}
      <VitalsBand
        className="mb-4"
        vitals={[
          {
            slot: "population",
            label: "Loans ever struck",
            value: <Prov info={bookLoanCountProv()}>{book.totals.loans}</Prov>,
          },
        ]}
        notes={
          <>
            <span>
              <Prov info={bookStatusCountProv("open")}>
                <span className="text-foreground">{book.totals.open}</span>
              </Prov>{" "}
              open
            </span>
            <span>
              <Prov info={bookStatusCountProv("repaid")}>
                <span className="text-foreground">{book.totals.repaid}</span>
              </Prov>{" "}
              repaid
            </span>
            <span>
              <Prov info={bookStatusCountProv("defaulted")}>
                <span className="text-foreground">{book.totals.defaulted}</span>
              </Prov>{" "}
              defaulted
            </span>
          </>
        }
      />

      <OpenBookSection book={book} />
      <CollateralSection book={book} />
      <CreditSection book={book} />
      <TermsSection book={book} />
      <DefaultsSection book={book} />
    </ProvReceiptsScope>
  );
}

/** The page header's stamp — where the book comes from and how far it runs. */
export function PwnBookStamp({ book }: { book: PwnLoanBook }) {
  if (book.stale || book.totals.loans === 0) return null;
  return (
    <p className="mt-2 text-[11px] text-rb-500">
      Indexed loan book · <span className="text-foreground">{book.totals.loans}</span> loans · most recent struck at
      block{" "}
      {book.latestCreatedBlock != null ? (
        <a
          href={explorerUrl(MAINNET_CHAIN_ID, "block", book.latestCreatedBlock)}
          target="_blank"
          rel="noopener noreferrer"
          className="link-external"
        >
          {book.latestCreatedBlock.toLocaleString("en-US")}
        </a>
      ) : (
        "—"
      )}{" "}
      · drawn from the same loan records the{" "}
      <Link href="/ethereum/pwn" className="text-blue-500 hover:underline">
        loan explorer
      </Link>{" "}
      shows
    </p>
  );
}
