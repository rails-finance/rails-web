import Link from "next/link";
import type { ReactNode } from "react";
import { CAPABILITIES, DEPTH, VIEW_NOTES, type DepthCell, type DepthKey } from "@/lib/shared/coverage";
import { CHAINS } from "@/lib/shared/chains";
import { explorerName, protocolForHref } from "@/lib/shared/protocols";

/**
 * The server-rendered "About this explorer" block under an explorer root: what
 * the explorer shows and how its figures are derived, so the page carries its
 * explanation without JavaScript. Every sentence is the coverage page's own
 * text for this explorer (the roster one-liner, `VIEW_NOTES`, and the
 * derivation columns of `DEPTH` with their `CAPABILITIES` details and `why`
 * notes), so the two surfaces cannot disagree. Server-only: the coverage
 * module stays out of the listing's client bundle.
 */

/** The matrix columns that say where a figure comes from. */
const DERIVATION: DepthKey[] = ["dashboard", "oracleUsd", "atBlockPrices", "verification"];

const SUBHEAD = "text-xs font-medium tracking-[0.12em] uppercase text-rb-500 mt-4 mb-1";

/** The matrix's strings are clauses; the block prints them as sentences. */
function sentence(s: string): string {
  const t = s.trim();
  return t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? "" : ".");
}

function derivationLine(key: DepthKey, cell: DepthCell): string | null {
  const cap = CAPABILITIES.find((c) => c.key === key);
  if (!cap || cell === false) return null;
  if (cell === true) return sentence(cap.detail);
  if ("except" in cell) return sentence(`${cap.detail}, except ${cell.except}`);
  if ("why" in cell) return `${cap.label}: ${sentence(cell.why)}`;
  return null; // `awaiting`: built, with nothing on chain to show yet
}

export function ExplorerAbout({ href }: { href: string }): ReactNode {
  const entry = protocolForHref(href);
  if (!entry) return null;
  const depth = DEPTH[entry.id];
  const view = VIEW_NOTES[entry.id];
  const lines = depth
    ? DERIVATION.map((key) => [key, derivationLine(key, depth[key])] as const).filter(
        (pair): pair is readonly [DepthKey, string] => pair[1] != null,
      )
    : [];

  return (
    // A front door centres its search, so the block centres under it; a
    // listing's rows run from the left edge, and so does the block.
    <section
      className={`mt-12 border-t border-rb-200 pt-6 max-w-3xl${entry.frontDoor ? " mx-auto" : ""}`}
      aria-labelledby="explorer-about"
    >
      <h2 id="explorer-about" className="text-xs font-medium tracking-[0.12em] uppercase text-rb-500 mb-2">
        About this explorer
      </h2>
      <p className="body-text">{entry.desc}.</p>
      {view && (
        <>
          <h3 className={SUBHEAD}>Protocol view</h3>
          <p className="body-text">{view}</p>
        </>
      )}
      {lines.length > 0 && (
        <>
          <h3 className={SUBHEAD}>How the figures are derived</h3>
          <ul className="body-text list-disc pl-5 space-y-1">
            {lines.map(([key, line]) => (
              <li key={key}>{line}</li>
            ))}
          </ul>
        </>
      )}
      <p className="body-text mt-4">
        <Link href={entry.infoHref} className="text-blue-500 hover:underline">
          About {explorerName(entry)}
        </Link>
        {" · "}
        <Link href={`/coverage/${CHAINS[entry.chainId].slug}`} className="text-blue-500 hover:underline">
          What&apos;s covered on {CHAINS[entry.chainId].name}
        </Link>
      </p>
    </section>
  );
}

/** Wrap an explorer root's page component so the block renders under it. */
export function withExplorerAbout<P extends object>(href: string, Page: (props: P) => ReactNode | Promise<ReactNode>) {
  return function ExplorerRoot(props: P) {
    return (
      <>
        <Page {...props} />
        <ExplorerAbout href={href} />
      </>
    );
  };
}
