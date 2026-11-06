import type { ReactNode } from "react";
import Link from "next/link";
import { formatFlowUsd } from "@/lib/shared/flows-timeline";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { formatValueHeld, spokenValueHeld, type ValueHeld, type ValueHeldPlace } from "@/lib/home/value-held";
import { CHAINS, type ChainId } from "@/lib/shared/chains";
import { ChainGlyph } from "@/components/icons/chain-glyphs";

/**
 * The body of /about/figures (ui-jobs 523; the home band's (i) modal until 6 Nov
 * 2026): what the home figures are and how they are counted. In order: the lead
 * (when a value is stated), the open and closed caption, then three tables on
 * one set of columns (FiguresTable): the per-explorer breakdown, what is not
 * counted and what counted explorers left out, each explorer linking to its
 * listing and its chain a glyph; the overlaps and the floor sentence; how
 * positions are counted.
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

const ROW = "border-t border-rb-200 align-top dark:border-rb-700";
const CELL = "py-2 pr-4 last:pr-0";

/** The three tables share one set of columns (Miles, 6 Nov 2026): the
 *  explorer, its chain as a glyph, a figure, the block, and a text column, so
 *  they read as one ledger; a column a table has nothing for stays empty. */
function FiguresTable({
  heads,
  label,
  children,
}: {
  heads: [string, string, string];
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] table-fixed text-left text-sm tabular-nums" aria-label={label}>
        <colgroup>
          <col className="w-[24%]" />
          <col className="w-14" />
          <col className="w-24" />
          <col className="w-48" />
          <col />
        </colgroup>
        <thead className="text-rb-500">
          <tr>
            <th scope="col" className="py-2 pr-4 font-medium">
              Explorer
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Chain
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">
              {heads[0]}
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              {heads[1]}
            </th>
            <th scope="col" className="py-2 font-medium">
              {heads[2]}
            </th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** The explorer (a link to its listing, "vaults" after it for a vault
 *  surface) and its chain's glyph, named for a screen reader and on hover. */
function PlaceCells({ place, label }: { place: ValueHeldPlace; label: string }) {
  const chain = CHAINS[place.chainId as ChainId];
  return (
    <>
      <td className={CELL}>
        {place.href ? (
          <Link href={place.href} className={INLINE_LINK} data-figures-explorer={`${place.chainId}:${label}`}>
            {label}
          </Link>
        ) : (
          <span className="text-foreground">{label}</span>
        )}
        {place.surface && <span className="text-rb-500"> {place.surface}</span>}
      </td>
      <td className={CELL} title={chain?.name}>
        <ChainGlyph id={place.chainId as ChainId} className="inline-block h-4 w-4 align-[-3px] text-foreground" />
        <span className="sr-only">{chain?.name ?? place.chainId}</span>
      </td>
    </>
  );
}

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
          <FiguresTable heads={["Share", "Block", "Prices"]} label="Held, by explorer">
            {value.rows.map((r) => (
              <tr key={r.key} className={ROW}>
                <PlaceCells place={r} label={r.label} />
                <td className={`${CELL} text-right`}>{fmtShare(r.share)}</td>
                <td className={`${CELL} whitespace-nowrap`}>{r.block ? fmtBlock(r.block) : "—"}</td>
                <td className={`${CELL} text-rb-500`}>
                  {r.oracleOf ?? r.prices}
                  {r.exemption && `; ${r.exemption}`}
                </td>
              </tr>
            ))}
          </FiguresTable>

          {value.notCounted.length > 0 && (
            <>
              <Heading>Not counted</Heading>
              <FiguresTable heads={["", "", "Reason"]} label="Not counted">
                {value.notCounted.map((n) => (
                  <tr key={`${n.label}:${n.chainId}:${n.surface}:${n.reason}`} className={ROW}>
                    <PlaceCells place={n} label={n.label} />
                    <td className={CELL} />
                    <td className={CELL} />
                    <td className={`${CELL} text-rb-500`}>{n.reason}</td>
                  </tr>
                ))}
              </FiguresTable>
            </>
          )}

          {value.leftOut.length > 0 && (
            <>
              <Heading>Left out of counted explorers</Heading>
              <FiguresTable heads={["Value", "", "What, and why"]} label="Left out of counted explorers">
                {value.leftOut.map((l) => (
                  <tr key={`${l.label}:${l.chainId}:${l.surface}:${l.reason}`} className={ROW}>
                    <PlaceCells place={l} label={l.label} />
                    <td className={`${CELL} text-right`}>
                      {l.usd !== null && l.usd >= 0.5 ? formatFlowUsd(l.usd) : ""}
                    </td>
                    <td className={CELL} />
                    <td className={`${CELL} text-rb-500`}>
                      <span className="text-foreground">{l.what}</span>: {l.reason}
                    </td>
                  </tr>
                ))}
              </FiguresTable>
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
