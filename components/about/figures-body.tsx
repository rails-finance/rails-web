import type { ReactNode } from "react";
import Link from "next/link";
import { formatFlowUsd } from "@/lib/shared/flows-timeline";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { formatValueHeld, spokenValueHeld, type ValueHeld } from "@/lib/home/value-held";

/**
 * The body of /about/figures (ui-jobs 523; the home band's (i) modal until 6 Nov
 * 2026): what the home figures are and how they are counted. In order: the lead
 * (when a value is stated), the open and closed caption, the per-explorer
 * breakdown with each explorer linking to its listing, what is not counted, the
 * overlaps and the floor sentence, then how positions are counted.
 *
 * The "how positions are counted" text states the rule the loader applies
 * (covered-positions-data.ts): each explorer's own listing total, all-time,
 * summed hourly; the grain each protocol counts in, and the Arbitrum census
 * grain (census-leg.ts); that "closed" absorbs every protocol's own ending;
 * and that the wallet figure is distinct across explorers (stats.ts counts
 * DISTINCT lower(wallet) over every listing).
 */
function CountedText() {
  return (
    <>
      Positions are the sum of each explorer&rsquo;s own listing total, counted all-time and refreshed hourly. A
      position is whatever the protocol&rsquo;s listing counts: a trove for Liquity and its forks, a vault for MakerDAO,
      one entry per wallet and market for Aave V3 and Morpho, one per wallet for Spark, Moonwell, Maple and Compound V2.
      On Arbitrum a position is a wallet that has ever supplied or borrowed on the protocol, read from the chain once a
      day. Closed includes liquidated, repaid and defaulted. Wallets are counted once across every explorer.
    </>
  );
}

const fmtBlock = (b: { from: number; to: number }) =>
  b.from === b.to ? b.to.toLocaleString("en-US") : `${b.from.toLocaleString("en-US")}–${b.to.toLocaleString("en-US")}`;

const fmtShare = (share: number) => (share < 0.001 ? "<0.1%" : `${(share * 100).toFixed(1)}%`);

function Heading({ children }: { children: ReactNode }) {
  return <h2 className="mt-12 mb-4 text-2xl font-semibold tracking-tight text-foreground">{children}</h2>;
}

export function FiguresBody({ value, caption }: { value: ValueHeld | null; caption: ReactNode }) {
  return (
    <div data-anatomy="S3.4">
      {value && (
        <p className="text-lg leading-relaxed text-foreground">
          From the smallest position to the largest, Rails shows each in the same detail. Together, the open positions
          hold{" "}
          <span className="font-semibold tabular-nums" aria-label={spokenValueHeld(value.totalUsd)}>
            {formatValueHeld(value.totalUsd)}
          </span>
          .
        </p>
      )}
      <p className="body-text mt-3">{caption}</p>

      {value && (
        <>
          <Heading>Held, by explorer</Heading>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm tabular-nums">
              <thead className="text-rb-500">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Explorer
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">
                    Share
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Block
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Prices
                  </th>
                </tr>
              </thead>
              <tbody>
                {value.rows.map((r) => (
                  <tr key={r.key} className="border-t border-rb-200 align-top dark:border-rb-700">
                    <td className="py-2 pr-4">
                      {r.href ? (
                        <Link href={r.href} className={INLINE_LINK} data-figures-explorer={r.key}>
                          {r.label}
                        </Link>
                      ) : (
                        <span className="text-foreground">{r.label}</span>
                      )}{" "}
                      <span className="text-rb-500">{r.chainName}</span>
                    </td>
                    <td className="py-2 pr-4 text-right">{fmtShare(r.share)}</td>
                    <td className="whitespace-nowrap py-2 pr-4">{r.block ? fmtBlock(r.block) : "—"}</td>
                    <td className="py-2 text-rb-500">
                      {r.oracleOf ?? r.prices}
                      {r.exemption && `; ${r.exemption}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {value.notCounted.length > 0 && (
            <>
              <Heading>Not counted</Heading>
              <ul className="body-text space-y-2">
                {value.notCounted.map((n) => (
                  <li key={`${n.label}:${n.chainName}:${n.reason}`}>
                    <span className="text-foreground">
                      {n.label} {n.chainName}
                    </span>
                    : {n.reason}
                  </li>
                ))}
              </ul>
            </>
          )}

          {value.leftOut.length > 0 && (
            <>
              <Heading>Left out of counted explorers</Heading>
              <ul className="body-text space-y-2">
                {value.leftOut.map((l) => (
                  <li key={`${l.label}:${l.chainName}:${l.reason}`}>
                    <span className="text-foreground">
                      {l.label} {l.chainName}
                    </span>
                    : {l.what}
                    {l.usd !== null && l.usd >= 0.5 && (
                      <span className="tabular-nums"> ({formatFlowUsd(l.usd)})</span>
                    )}: {l.reason}
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="body-text mt-6 space-y-2">
            {value.overlaps.map((o) => (
              <p key={o}>{o}</p>
            ))}
            <p>The figure is a floor: debt is neither added nor subtracted, and what is not counted is named above.</p>
          </div>
        </>
      )}

      <Heading>How positions are counted</Heading>
      <p className="body-text">
        <CountedText />
      </p>
    </div>
  );
}
