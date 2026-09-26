"use client";

// The Frankencoin PROTOCOL view (/frankencoin/system) — the system sibling of
// /makerdao/system and /liquity-v1/system, adapted to what Frankencoin is: an
// oracle-free system whose protocol-level truth is a BALANCE SHEET and an
// ENFORCEMENT RECORD, not a market board.
//
// Other systems' views lead with prices and ratios. Frankencoin has neither —
// no oracle, no health factor, and 26 heterogeneous collateral tokens with no
// feed to sum them by, so there is deliberately NO "total collateral" and NO
// collateralization ratio here (each would import a price the protocol
// doesn't have). What the system CAN state about itself, it states exactly:
//
//   1. The franc — how much ZCHF exists, and the FPS equity market the
//      capital trades in (ZCHF-per-FPS, the contract's own cubic rule).
//   2. The capital — the reserve's two accounts (FPS equity + borrowers'
//      held-back contributions), read as the three-sided identity the
//      contract maintains.
//   3. The rate frame — the Leadrate that prices new V2 minting, with its
//      boundary stated (a head read is not any position's at-mint rate).
//   4. The minting book and the challenge record — aggregates over the SAME
//      indexed rows the listing pages, reduced per request.
//
// Framing follows the V4 hub / V1 system views: present, don't rank. No
// score, no risk valence; the only chroma is interaction blue.

import Link from "next/link";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { ProvenanceInfoTabs } from "@/components/shared/provenance-info-tabs";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { frankencoinMintingContent, frankencoinChallengeContent } from "@/lib/shared/learn-more-content";
import {
  zchfSupplyProv,
  equityProv,
  minterReserveProv,
  reserveIdentityProv,
  fpsSupplyProv,
  fpsPriceProv,
  leadrateProv,
  openingFeeProv,
  bookCountProv,
  openMintedProv,
} from "@/lib/frankencoin/system-provenance";
import { ppmToPct } from "@/lib/frankencoin/asset-catalog";
import { Stat } from "@/components/shared/stat";
import { formatCompact, formatExact, formatNumber } from "@/lib/utils/format";
import type { FrankencoinSystemChainResponse } from "@/lib/sources/chain/frankencoin-system";
import type { FrankencoinBook } from "@/lib/sources/api/frankencoin-system-book";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { formatDate } from "@/lib/date";

const dateOf = (unix: number): string => formatDate(unix);

/** The franc itself — supply and the FPS equity market. */
function FrancCard({ data }: { data: FrankencoinSystemChainResponse }) {
  return (
    <div className="rounded-xl bg-raised px-4 py-3.5">
      <div className="text-xs font-semibold text-foreground">The franc</div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        <Stat label="ZCHF in existence">
          <Prov info={zchfSupplyProv()} value={formatExact(data.zchfSupply)}>
            {formatCompact(data.zchfSupply)} ZCHF
          </Prov>
        </Stat>
        <Stat label="FPS outstanding">
          <Prov info={fpsSupplyProv(data.reserveAddress)} value={formatExact(data.fpsSupply)}>
            {formatCompact(data.fpsSupply)} FPS
          </Prov>
        </Stat>
        <Stat label="FPS price">
          <Prov info={fpsPriceProv(data.reserveAddress)} value={formatExact(data.fpsPrice)}>
            {formatNumber(data.fpsPrice)} ZCHF
          </Prov>
        </Stat>
      </div>

      <p className="mt-2.5 text-[11px] leading-relaxed text-rb-500">
        ZCHF is a Swiss-franc stablecoin with more than one minter — the hubs below, a bridge, and the savings
        module&rsquo;s interest all mint it — so the supply is the franc count itself, stated beside the hub book rather
        than equated with it. The FPS price is the Equity contract&rsquo;s own issuance rule (3 × equity ÷ FPS supply),
        in ZCHF like every figure on this page.
      </p>
    </div>
  );
}

/** The reserve's two accounts, as the identity the contract maintains. */
function CapitalCard({ data }: { data: FrankencoinSystemChainResponse }) {
  const total = data.reserveBalance;
  const eqShare = total > 0 ? data.equity / total : 0;
  return (
    <div className="rounded-xl bg-raised px-4 py-3.5">
      <div className="text-xs font-semibold text-foreground">The capital behind it</div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        <Stat label="Equity (FPS holders)">
          <Prov info={equityProv()} value={formatExact(data.equity)}>
            {formatCompact(data.equity)} ZCHF
          </Prov>
        </Stat>
        <Stat label="Borrowers' reserve">
          <Prov info={minterReserveProv()} value={formatExact(data.minterReserve)}>
            {formatCompact(data.minterReserve)} ZCHF
          </Prov>
        </Stat>
        <Stat label="Reserve pool, total">
          <Prov info={reserveIdentityProv(data.reserveAddress)} value={formatExact(total)}>
            {formatCompact(total)} ZCHF
          </Prov>
        </Stat>
      </div>

      {total > 0 && (
        <>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-rb-200 dark:bg-rb-500/30">
            <div className="h-full rounded-l-full bg-blue-500" style={{ width: `${eqShare * 100}%` }} />
          </div>
          <div className="mt-1.5 flex items-baseline justify-between text-[11px] tabular-nums text-rb-500">
            <span>equity {(eqShare * 100).toFixed(1)}%</span>
            <span>borrowers&rsquo; contributions {((1 - eqShare) * 100).toFixed(1)}%</span>
          </div>
        </>
      )}

      <p className="mt-2.5 text-[11px] leading-relaxed text-rb-500">
        One pool, two accounts — the reserve&rsquo;s balance equals equity plus the borrowers&rsquo; contributions by
        the contract&rsquo;s own accounting, and this page reads all three sides at one block. A challenge shortfall
        lands on the position&rsquo;s own contribution first, then on the equity: FPS capital is the junior tranche.
      </p>
    </div>
  );
}

/** The rate frame — the Leadrate and the flat opening fee. */
function RatesCard({ data }: { data: FrankencoinSystemChainResponse }) {
  const pendingChange =
    data.nextRatePPM != null &&
    data.leadratePPM != null &&
    data.nextRatePPM !== data.leadratePPM &&
    data.nextChange != null;
  return (
    <div className="rounded-xl bg-raised px-4 py-3.5">
      <div className="text-xs font-semibold text-foreground">Rates &amp; fees</div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        <Stat label="Base rate (Leadrate)">
          {data.leadratePPM != null ? (
            <Prov info={leadrateProv(data.leadrateAddress)} value={String(data.leadratePPM)}>
              {ppmToPct(data.leadratePPM).toFixed(2)}%
            </Prov>
          ) : (
            "—"
          )}
        </Stat>
        <Stat label="Opening fee">
          {data.openingFeeZchf != null ? (
            <Prov info={openingFeeProv()} value={formatExact(data.openingFeeZchf)}>
              {formatCompact(data.openingFeeZchf)} ZCHF
            </Prov>
          ) : (
            "—"
          )}
        </Stat>
        {pendingChange && (
          <Stat label="Announced change">
            <Prov info={leadrateProv(data.leadrateAddress)} value={String(data.nextRatePPM)}>
              {ppmToPct(data.nextRatePPM!).toFixed(2)}%
            </Prov>
            <span className="ml-1 text-rb-500">from {dateOf(data.nextChange!)}</span>
          </Stat>
        )}
      </div>

      <p className="mt-2.5 text-[11px] leading-relaxed text-rb-500">
        The Leadrate prices <span className="text-foreground">new</span> V2 minting: each position pays it plus its own
        fixed risk premium, charged up front for the remaining term at each mint. Governance moves the Leadrate, and a
        position&rsquo;s past mints keep the rate of their own moment — today&rsquo;s figure prices today&rsquo;s
        minting only. V1 positions fixed their whole rate at opening; the opening fee is the flat spam gate every new
        original position pays before its veto window starts.
      </p>
    </div>
  );
}

/** The minting book — the roster this system has written. */
function BookCard({ book }: { book: FrankencoinBook }) {
  return (
    <div className="rounded-xl bg-raised px-4 py-3.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-foreground">The minting book</span>
        <LearnMore content={frankencoinMintingContent()} inline />
      </div>

      {book.bookStale ? (
        <p className="mt-2.5 text-[11px] leading-relaxed text-rb-500">
          The index didn&rsquo;t answer on this read, so the book is withheld rather than estimated. The chain figures
          above stand on their own.
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <Stat label="Positions ever">
              <Prov info={bookCountProv("Positions ever opened", "Split by the hub that announced each opening.")}>
                {book.total}
              </Prov>
              <span className="ml-1 text-rb-500">
                · {book.v1} V1, {book.v2} V2
              </span>
            </Stat>
            <Stat label="Open at head">
              <Prov info={bookCountProv("Positions open at head", "The replayed lifecycle; the listing's open set.")}>
                {book.open}
              </Prov>
            </Stat>
            <Stat label="Minted by the open book">
              <Prov info={openMintedProv()} value={formatExact(book.openMintedZchf)}>
                {formatCompact(book.openMintedZchf)} ZCHF
              </Prov>
            </Stat>
            <Stat label="Collateral tokens">
              <Prov
                info={bookCountProv(
                  "Distinct collateral tokens",
                  "Counted across the whole book; anyone can open a position on any ERC-20.",
                )}
              >
                {book.allCollateralTokens}
              </Prov>
              <span className="ml-1 text-rb-500">· {book.openCollateralTokens} in open use</span>
            </Stat>
          </div>

          <p className="mt-2.5 text-[11px] leading-relaxed text-rb-500">
            Anyone can open a position on any ERC-20 — {book.clones} of the {book.total} are clones reusing an
            already-vetted original&rsquo;s terms. The tokens are counted rather than summed:{" "}
            <span className="text-foreground">no collateral total exists here</span>, because valuing{" "}
            {book.allCollateralTokens} different tokens would take a price feed the protocol deliberately runs without.{" "}
            <Link href="/ethereum/frankencoin" className="text-blue-500 hover:underline">
              Browse the positions
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}

/** The enforcement record — the oracle substitute's own history. */
function EnforcementCard({ book }: { book: FrankencoinBook }) {
  return (
    <div className="rounded-xl bg-raised px-4 py-3.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-foreground">The enforcement record</span>
        <LearnMore content={frankencoinChallengeContent()} inline />
      </div>

      {book.bookStale ? (
        <p className="mt-2.5 text-[11px] leading-relaxed text-rb-500">
          The index didn&rsquo;t answer on this read, so the record is withheld rather than estimated.
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <Stat label="Challenges ever">
              <Prov
                info={bookCountProv("Challenges ever started", "The sum of every position's replayed challenge tally.")}
              >
                {book.challengesStarted}
              </Prov>
              <span className="ml-1 text-rb-500">
                · {book.challengedPositions} position{book.challengedPositions === 1 ? "" : "s"}
              </span>
            </Stat>
            <Stat label="Reached a phase-2 sale">
              <Prov
                info={bookCountProv(
                  "Challenges that reached a phase-2 sale",
                  "Challenges with at least one ChallengeSucceeded slice; the rest were averted or still run.",
                )}
              >
                {book.challengesSucceeded}
              </Prov>
            </Stat>
            <Stat label="Denied in the veto window">
              <Prov info={bookCountProv("Positions denied", "The replayed PositionDenied lifecycle.")}>
                {book.denied}
              </Prov>
            </Stat>
            <Stat label="Cleared by forced sale">
              <Prov
                info={bookCountProv("Positions with a forced sale", "Expired positions cleared through the V2 hub.")}
              >
                {book.forcedSalePositions}
              </Prov>
            </Stat>
          </div>

          <p className="mt-2.5 text-[11px] leading-relaxed text-rb-500">
            This record is Frankencoin&rsquo;s whole substitute for an oracle: declared prices stand until a challenge
            auction tests one, the veto window filters new originals, and forced sales clear what expires. A challenge
            that reached a phase-2 sale sold position collateral; the others were averted at the declared price — the
            market calling the price fair — or are still running.
          </p>
        </>
      )}
    </div>
  );
}

export function FrankencoinSystemView({ data, book }: { data: FrankencoinSystemChainResponse; book: FrankencoinBook }) {
  const registry = useReceiptRegistry();

  if (data.chainStale) {
    return (
      <div className="py-12 text-center text-rb-500">
        <p className="mb-1">Couldn&apos;t read Frankencoin&apos;s system state from chain.</p>
        <p className="text-sm">
          This view is a live contract read with no cached fallback — rather than show stale figures, it shows nothing.
          Try again shortly.
        </p>
      </div>
    );
  }

  return (
    <ProvReceiptsScope registry={registry}>
      <section>
        <h2 className="text-sm font-semibold text-foreground">The system</h2>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <FrancCard data={data} />
          <CapitalCard data={data} />
          <RatesCard data={data} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-foreground">The book &amp; its enforcement</h2>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <BookCard book={book} />
          <EnforcementCard book={book} />
        </div>
      </section>

      <ProvenanceInfoTabs className="mt-6" />
    </ProvReceiptsScope>
  );
}

/** The page header's live-read stamp — the block every chain figure was read at. */
export function FrankencoinSystemStamp({ data }: { data: FrankencoinSystemChainResponse }) {
  if (data.chainStale || data.blockNumber === 0) return null;
  return (
    <p className="mt-2 text-[11px] text-rb-500">
      Chain snapshot · block{" "}
      <a
        href={explorerUrl(MAINNET_CHAIN_ID, "block", data.blockNumber)}
        target="_blank"
        rel="noopener noreferrer"
        className="link-external"
      >
        {data.blockNumber.toLocaleString("en-US")}
      </a>
      {" · "}
      {formatCompact(data.zchfSupply)} ZCHF outstanding against {formatCompact(data.reserveBalance)} ZCHF of reserve
      capital
    </p>
  );
}
