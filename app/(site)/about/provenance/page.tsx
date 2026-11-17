// focus: about Rails itself; no asset or chain to filter
import type { ReactNode } from "react";
import Link from "next/link";
import { Crosshair } from "lucide-react";
import type { Metadata } from "next";
import { HOME_SHARE_IMAGE, SITE_URL, twitterCard } from "@/lib/shared/page-metadata";
import { DetailBackButton } from "@/components/shared/detail-back-row";
import { ProvenanceExample } from "@/components/about/provenance-example";
import { EXAMPLE } from "@/lib/about/provenance-example";
import {
  CLASS_LINES,
  CLASS_NAMES,
  COMPUTED_LINE,
  DEFINITION_LINE,
  KIND_OF_FIGURE,
  KINDS_OF_FIGURE,
  LADDER_TITLE,
  capitalise,
} from "@/lib/shared/prov-class-words";

const SHARE = {
  title: "Receipts and the provenance inspector | Rails",
  description:
    "What an underlined figure on Rails is, what its receipt holds, and how to check the figure against the chain.",
};

export const metadata: Metadata = {
  title: "Receipts and the provenance inspector",
  description: SHARE.description,
  alternates: { canonical: "/about/provenance" },
  openGraph: {
    ...SHARE,
    url: `${SITE_URL}/about/provenance`,
    images: [HOME_SHARE_IMAGE],
  },
  twitter: twitterCard(SHARE),
};

const LINK = "text-blue-600 dark:text-[var(--text-link)] hover:underline";
const MONO = "font-mono text-[0.9em] break-all";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="mb-4 text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Term({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="sm:grid sm:grid-cols-[8rem_1fr] sm:gap-4">
      <dt className="font-semibold text-foreground">{name}</dt>
      <dd className="body-text">{children}</dd>
    </div>
  );
}

const shortHex = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;

/** /about/provenance (ui-jobs 603): the underlined figure, the receipt and the
 *  provenance inspector, for a reader who has met one. Every claim is the
 *  app's behaviour (prov-inspector.tsx, provenance.tsx, the profile menu's
 *  switch); the worked example is a real receipt drawn from fixed data
 *  (components/about/provenance-example.tsx). */
export default function ProvenancePage() {
  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 pt-32 pb-16">
      {/* The standard Back (H7): history, else About. */}
      <div className="mb-8" data-anatomy="H7" data-back-row="">
        <DetailBackButton fallbackHref="/about" />
      </div>

      <h1 className="font-sans font-semibold tracking-tight leading-tight text-foreground text-[clamp(28px,4.5vw,48px)] mb-6">
        Receipts and the provenance inspector
      </h1>
      <p className="text-rb-500 text-lg leading-relaxed">
        A figure on Rails can carry a receipt: a short record of where the figure comes from on the chain and how to
        check it.
      </p>

      <Section title="Turning it on">
        <p className="body-text">
          The inspector has one switch: <strong className="text-foreground">Inspector</strong>, under Advanced in the
          profile menu at the top right. Once on, it stays on from page to page, on the pages that support it. While it
          is on, a teal crosshair{" "}
          <Crosshair
            className="inline size-4 align-[-3px] text-teal-600 dark:text-teal-400"
            strokeWidth={1.75}
            aria-hidden="true"
          />{" "}
          stands beside the profile menu on any page with something to inspect; hover over it for a reminder of what to
          do. The same switch turns the inspector off.
        </p>
      </Section>

      <Section title="Underlined figures">
        <p className="body-text">
          While the inspector is on, each figure with a receipt has a dotted underline. A click or a tap on one opens
          its receipt beside it; on a phone the receipt opens as a sheet at the foot of the screen. A click elsewhere
          closes it. Escape closes an open receipt, and a second Escape turns the inspector off.
        </p>
      </Section>

      <Section title="What a receipt holds">
        <p className="body-text">
          The receipt below is a real one, for the collateral a Liquity V2 trove held after one event. The TroveManager
          contract recorded it at block {EXAMPLE.block.toLocaleString("en-US")}. Its parts, top to bottom:
        </p>
        <div className="py-2">
          <ProvenanceExample />
        </div>
        <dl className="space-y-3">
          <Term name="Head">
            Coloured dots for the {KIND_OF_FIGURE}, then its name and its value as the page shows it.
          </Term>
          <Term name="Summary">What the figure means on the chain, in plain words.</Term>
          <Term name="Whole number">The integer the chain stores, and how it becomes the figure shown.</Term>
          <Term name="Via line">
            The log or contract call the figure comes from, its field, the raw value and the divisor. The log&rsquo;s
            name links to the transaction&rsquo;s event logs on Etherscan.
          </Term>
          <Term name="Source row">
            The block, the transaction and the contract. The transaction and the contract link to Etherscan; the block
            and the transaction each have a copy button.
          </Term>
        </dl>
        <p className="body-text">
          Other receipts add a line opening &ldquo;To check:&rdquo;, a formula opening &ldquo;=&rdquo; with one row per
          input, or the full figure under a rounded one.
        </p>
      </Section>

      <Section title={capitalise(KINDS_OF_FIGURE)}>
        <p className="body-text">
          The dots in a receipt&rsquo;s head name the {KIND_OF_FIGURE}. Pressing them opens {`“${LADDER_TITLE}”`}, which
          ranks the {KINDS_OF_FIGURE} by their distance from the chain. The first three can be checked on the chain
          without Rails.
        </p>
        <dl className="space-y-3">
          {CLASS_LINES.map(({ cls, line }) => (
            <Term key={cls} name={CLASS_NAMES[cls]}>
              {line}
            </Term>
          ))}
        </dl>
        <p className="body-text">
          {COMPUTED_LINE} {DEFINITION_LINE}
        </p>
      </Section>

      <Section title="Checking a figure">
        <p className="body-text">
          A receipt names where its figure can be checked. A figure read from a contract has a line naming the call and
          the block: &ldquo;To check: ask any Ethereum archive node for the vault&rsquo;s totalAssets() at block
          26400704.&rdquo; A block explorer shows a contract&rsquo;s current state, so a past block needs an archive
          node. A figure from an event links to its transaction. The example above checks in four steps:
        </p>
        <ol className="body-text list-decimal space-y-2 pl-5">
          <li>
            Open the transaction, <span className={MONO}>tx {shortHex(EXAMPLE.txHash)}</span>. Etherscan opens on its
            event logs.
          </li>
          <li>
            Find the TroveUpdated log from TroveManager <span className={MONO}>{shortHex(EXAMPLE.troveManager)}</span>.
          </li>
          <li>
            Read its <span className={MONO}>_coll</span> field: <span className={MONO}>{EXAMPLE.raw}</span>.
          </li>
          <li>
            Move the decimal point 18 places to the left, for WETH&rsquo;s 18 decimal places:{" "}
            <span className={MONO}>660.277137183731377026</span>. The page rounds it to {EXAMPLE.display}.
          </li>
        </ol>
      </Section>

      <Section title="Limits of a receipt">
        <ul className="body-text list-disc space-y-2 pl-5">
          <li>
            A price is one source&rsquo;s price at one block. The receipt names the source, and a dollar figure is an
            amount times that price.
          </li>
          <li>
            When the latest read fails, a card shows its last stored read and says so: &ldquo;Stored read at block …;
            the latest read failed.&rdquo; Its figures stand at that block.
          </li>
          <li>
            While the inspector is on, a figure with no underline has no receipt. The inspector works only on pages
            Rails has checked for such figures; elsewhere the switch keeps its setting for the next one.
          </li>
        </ul>
      </Section>

      <Section title="Read more">
        <ul className="body-text space-y-2">
          <li>
            <Link href="/about/architecture" className={LINK}>
              How the data gets to the page
            </Link>
            <span className="text-rb-500"> · the index, the chain reads and the API behind each figure</span>
          </li>
          <li>
            <Link href="/about/figures" className={LINK}>
              How the figures are counted
            </Link>
            <span className="text-rb-500"> · the positions Rails covers and the value they hold</span>
          </li>
          <li>
            <Link href="/coverage/ethereum" className={LINK}>
              Coverage
            </Link>
            <span className="text-rb-500"> · how deep each explorer goes, chain by chain</span>
          </li>
        </ul>
      </Section>
    </div>
  );
}
