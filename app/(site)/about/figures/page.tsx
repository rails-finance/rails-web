// focus: about Rails itself; no asset or chain to filter
import type { Metadata } from "next";
import { HOME_SHARE_IMAGE, SITE_URL, twitterCard } from "@/lib/shared/page-metadata";
import { getCoveredPositions } from "@/lib/home/covered-positions-data";
import { getHomeStats } from "@/lib/home/home-stats-data";
import { getValueHeld } from "@/lib/home/value-held-data";
import { CoveredCaption } from "@/components/home/covered-stats";
import { FiguresBody } from "@/components/about/figures-body";
import { IndexNotice } from "@/components/shared/index-notice";
import { DetailBackButton } from "@/components/shared/detail-back-row";

// The same figures as the home band, on the same hourly refresh.
export const revalidate = 3600;

const SHARE = {
  title: "How the figures are counted | Rails",
  description:
    "The positions Rails covers and the value they hold, explorer by explorer, with the block and prices behind each.",
};

export const metadata: Metadata = {
  title: "How the figures are counted",
  description: SHARE.description,
  alternates: { canonical: "/about/figures" },
  openGraph: {
    ...SHARE,
    url: `${SITE_URL}/about/figures`,
    images: [HOME_SHARE_IMAGE],
  },
  twitter: twitterCard(SHARE),
};

/** /about/figures (ui-jobs 523): the home band's figures explained, each
 *  explorer linking to its listing. The home sentence links here. */
export default async function FiguresPage() {
  const [covered, stats, valueHeld] = await Promise.all([getCoveredPositions(), getHomeStats(), getValueHeld()]);

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 pt-32 pb-16">
      {/* The standard Back (H7): history, else About. */}
      <div className="mb-8" data-anatomy="H7" data-back-row="">
        <DetailBackButton fallbackHref="/about" />
      </div>

      <h1 className="font-sans font-semibold tracking-tight leading-tight text-foreground text-[clamp(28px,4.5vw,48px)] mb-6">
        How the figures are counted
      </h1>

      {covered ? (
        <FiguresBody value={valueHeld} caption={<CoveredCaption covered={covered} stats={stats} />} />
      ) : (
        <IndexNotice />
      )}
    </div>
  );
}
