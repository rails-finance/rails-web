// focus: about Rails itself; no asset or chain to filter
import type { ReactNode } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { HOME_SHARE_IMAGE, SITE_URL, twitterCard } from "@/lib/shared/page-metadata";
import { DetailBackButton } from "@/components/shared/detail-back-row";
import { ProvenanceExample } from "@/components/about/provenance-example";
import { EXAMPLE } from "@/lib/about/provenance-example";

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

      <Section title="Underlined figures">
        <p className="body-text">
          While the provenance inspector is on, each figure with a receipt has a dotted underline. A click or a tap on
          one opens its receipt beside it; on a phone the receipt opens as a sheet at the foot of the screen. A click
          elsewhere closes it. Escape closes an open receipt, and a second Escape turns the inspector off.
        </p>
        <ul className="body-text list-disc space-y-2 pl-5">
          <li>
            <strong className="text-foreground">Inspect provenance</strong>, in a card&rsquo;s or an event&rsquo;s ⋮
            menu, underlines the figures in that card alone and draws a ring round it. The row then reads &ldquo;Stop
            inspecting&rdquo;.
          </li>
          <li>
            <strong className="text-foreground">Inspect provenance</strong>, in a page&rsquo;s Tools menu, does the same
            for the whole page.
          </li>
          <li>
            <strong className="text-foreground">Provenance inspector</strong>, a switch in the profile menu, turns the
            inspector on as each page opens, on the pages that support it, with a lighter underline. Turned on from a
            menu, the inspector offers a &ldquo;Keep this on&rdquo; button that sets the switch.
          </li>
        </ul>
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
            Coloured dots for the kind of figure, then its name and its value as the page shows it.
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

      <Section title="Kinds of figure">
        <p className="body-text">
          The dots in a receipt&rsquo;s head name the kind of figure. Pressing them opens the distance ladder, which
          ranks the kinds by their distance from the chain. The first three can be checked on the chain without Rails.
        </p>
        <dl className="space-y-3">
          <Term name="Emitted">A field in a transaction&rsquo;s event log. Any block explorer shows it.</Term>
          <Term name="State">A value a contract returned at a stated block. Any archive node returns it again.</Term>
          <Term name="Oracle">A price from a feed on the chain. The feed&rsquo;s log for that round holds it.</Term>
          <Term name="Indexed">Built by Rails&rsquo;s index from the events it recorded. No third party holds it.</Term>
          <Term name="Off-chain">
            No anchor on the chain, such as a price from an outside service. Nothing on the chain confirms it.
          </Term>
        </dl>
        <p className="body-text">
          A figure worked out from others is computed. Its head shows one dot for each kind among its inputs, and it is
          as checkable as its furthest input.
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
            While the inspector is on, a figure with no underline has no receipt. The profile menu&rsquo;s switch turns
            the inspector on only on pages Rails has checked for such figures.
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
