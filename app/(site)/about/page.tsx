// focus: about Rails itself; no asset or chain to filter
import Link from "next/link";
import type { Metadata } from "next";
import { HOME_SHARE_IMAGE, SITE_URL, twitterCard } from "@/lib/shared/page-metadata";
import { launchedChains, protocolsForChain } from "@/lib/shared/protocols";
import { SITE_LEAD, SITE_METHOD } from "@/lib/shared/site-copy";
import { AudienceGrid } from "@/components/shared/audience";
import { TeamSection } from "@/components/shared/team-section";

// The description is the page's opening, word for word (rails-ops ui-jobs 475):
// a search summary quotes the meta description, and it should say what a reader
// of the page is told.
const DESCRIPTION = `${SITE_LEAD} ${SITE_METHOD}`;
const SHARE = { title: "About Rails", description: DESCRIPTION };

export const metadata: Metadata = {
  title: "About",
  description: DESCRIPTION,
  alternates: { canonical: "/about" },
  openGraph: { ...SHARE, url: `${SITE_URL}/about`, images: [HOME_SHARE_IMAGE] },
  twitter: twitterCard(SHARE),
};

const H2 = "text-3xl font-semibold tracking-tight text-foreground";
const LINK = "text-blue-600 dark:text-[var(--text-link)] hover:underline";

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 pt-32 pb-16">
      <h1 className="font-sans font-semibold tracking-tight leading-tight text-foreground text-[clamp(28px,4.5vw,48px)] mb-6">
        About Rails
      </h1>
      <p className="text-rb-500 text-lg leading-relaxed">{SITE_LEAD}</p>
      <p className="text-rb-500 text-lg leading-relaxed mt-3">{SITE_METHOD}</p>
      <p className="body-text mt-3">
        Look up any wallet by address or ENS name, or browse every open position in a protocol. Rails is read-only: no
        wallet connection, no signatures, no login.{" "}
        <Link href="/about/architecture" className={LINK}>
          How the data gets to the page
        </Link>
        {" · "}
        <Link href="/about/provenance" className={LINK}>
          How to check a figure
        </Link>
      </p>

      <section className="mt-14">
        <h2 className={`${H2} mb-8`}>Who it is for</h2>
        <AudienceGrid columns="" />
      </section>

      <section className="mt-14">
        <h2 className={`${H2} mb-3`}>The explorers</h2>
        <p className="body-text mb-8">How deep each explorer goes is stated per chain on its coverage page.</p>
        <div className="space-y-10">
          {launchedChains().map((chain) => (
            <div key={chain.id}>
              <h3 className="text-lg font-semibold text-foreground mb-3 flex flex-wrap items-baseline gap-x-3">
                {chain.name}
                <Link href={`/coverage/${chain.slug}`} className={`text-sm font-medium ${LINK}`}>
                  Coverage
                </Link>
              </h3>
              <ul className="space-y-3">
                {protocolsForChain(chain.id).map((p) => (
                  <li key={p.id} className="leading-relaxed">
                    <Link href={p.href} className={`font-medium ${LINK}`}>
                      {p.label}
                    </Link>
                    <span className="text-rb-500"> · {p.desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <TeamSection />
      </section>
    </div>
  );
}
