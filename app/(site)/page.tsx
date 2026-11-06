import type { Metadata } from "next";
import { CoveredStats } from "@/components/home/covered-stats";
import { HomeHero } from "@/components/home/home-hero";
import { LiveExampleFrame } from "@/components/home/live-example-frame";
import { ProtocolRow } from "@/components/home/protocol-row";
import { StageRail } from "@/components/home/stage-rail";
import { TrackLines } from "@/components/home/track-lines";
import { TEAM_LINE, TEAM_NAME, TeamSection } from "@/components/shared/team-section";
import { AudienceGrid } from "@/components/shared/audience";
import { getLiveExampleData } from "@/lib/home/live-example-data";
import { packLiveExample } from "@/lib/home/live-example-wire";
import { getCoveredPositions } from "@/lib/home/covered-positions-data";
import { getHomeStats } from "@/lib/home/home-stats-data";
import { getValueHeld } from "@/lib/home/value-held-data";
import { DirectoryHeading } from "@/components/home/directory-heading";
import { StructuredData } from "@/components/StructuredData";

// ISR — the page (and the live-example trove data fetched below) regenerates
// in the background at most hourly; every visitor gets the static render.
export const revalidate = 3600;

// The root layout sets no canonical (each page names its own), so the home page
// names "/" here.
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function Home() {
  // Independent legs — the hero count, the live-example trove, and the
  // overview stats each hit a different roster/endpoint, so fetch them
  // concurrently rather than stacking their latency.
  const [liveExample, covered, stats, valueHeld] = await Promise.all([
    getLiveExampleData(),
    getCoveredPositions(),
    getHomeStats(),
    getValueHeld(),
  ]);
  return (
    <div className="min-h-screen">
      {/* The site's WebApplication JSON-LD, on the home page only (ui-jobs 513). */}
      <StructuredData />
      {/* ═══ TOP SECTION — headline, the explorer directory, and the live
          example, on one gradient that runs light at the top to dark at the
          bottom so the iframe content feathers into it. ═══ */}
      {/* via == to pins the bottom half to a constant color, so the frame's
          bottom fade (which ends on the same background/rb-800 stop) melts
          into it with no seam. The light floor is the app's own canvas, so the
          marketing page hands off to the paper the product is drawn on rather
          than bottoming out darker than it.
          ⚠️ `background` is the ONE stop that follows html.dark: it is
          `var(--background)` via `@theme inline` (globals.css:234), where the
          rb-* stops inline their @theme literal and never see the override
          (see the note at globals.css:297). Hence the explicit dark: companions
          below — without them the dark hero floor would drift off rb-800. */}
      {/* overflow-x-clip: the live-example frame's glow layer reaches past
          the content column; clip it at the section edge instead of letting
          it mint a horizontal scrollbar on narrow viewports. */}
      <div className="overflow-x-clip bg-gradient-to-b from-rb-50 via-background to-background dark:from-rb-600 dark:via-rb-800 dark:to-rb-800">
        <HomeHero />

        {/* Below the hero, top down (Miles, 5 Nov 2026): the track lines as the
            way out of the hero, the roster counted, the live sample (a link to
            it on a phone), the explorer directory. */}
        {/* Track lines graphic — the animated stripes, risen 80px into the
            hero's foot. The casing var is the gradient tone behind the lines:
            `--background` light, which tracks the `to-background` stop; dark
            a literal rgb(24 26 36), the gradient's colour at the middle of the
            graphic (it runs 25 27 38 at the top edge to 23 25 35 at the foot,
            rb-600 to rb-800 over the first half of the page), so a crossing
            reads as a gap rather than a darker patch. The literal is needed
            because the `dark:to-rb-800` stop inlines the @theme value and
            never sees the html.dark override. */}
        <section
          className="-mt-20 pb-16 [--track-casing:var(--background)] dark:[--track-casing:rgb(24_26_36)]"
          data-anatomy="S4"
        >
          <TrackLines />
        </section>

        {/* The roster, counted, then the live position that is one of them. */}
        {/* From sm the framed sample stands 128px clear of the value line and of
            the directory (Miles, 5 Nov 2026); a phone's button keeps 64px. */}
        <section className="pb-16 sm:pb-32" data-anatomy="S3">
          <CoveredStats covered={covered} stats={stats} valueHeld={valueHeld} />
        </section>

        {/* Live example — a real trove in browser chrome; its hover pill
            links to the live position. */}
        <section className="pb-16 sm:pb-32" data-anatomy="S2">
          <LiveExampleFrame data={liveExample && packLiveExample(liveExample)} />
        </section>

        {/* Explorer directory — one uniform row of tiles on the gradient's
            constant floor, directly above the "DeFi for everyone" band. */}
        <section className="pb-16" data-anatomy="S5">
          <DirectoryHeading />
          <ProtocolRow />
        </section>
      </div>

      {/* ═══ The page's lower half (Miles, 5 Nov 2026): one gradient, the mirror
          of the top section's, from the floor S5 stands on back to the top's
          tone at the foot, with 64px more under the last band so the footer
          (the raised tone, ui-jobs 509) stands clear of it. It starts where the top section ends, so the
          darkest band stays at S5 however tall the directory opens; the bands
          below draw no ground of their own. ═══ */}
      <div
        className="bg-gradient-to-b from-background to-rb-50 pb-16 dark:from-rb-800 dark:to-rb-600"
        data-home-lower=""
      >
        {/* ═══ WHO IS RAILS FOR ═══ */}
        {/* The personas lead: the directory says what Rails covers, this says
            who it's for, and the capability list below answers the "how" for
            whoever they caught. */}
        <div data-anatomy="S6">
          <div className="max-w-7xl mx-auto px-4 pt-16 pb-16">
            <div className="mb-6">
              <h2 className="mb-10 text-3xl font-semibold tracking-tight text-foreground">
                <span className="marketing">DeFi</span> for everyone
              </h2>
            </div>

            <AudienceGrid />
          </div>
        </div>

        {/* ═══ WHAT RAILS DOES — the plain answer to "what is this thing?": one
          intro paragraph (what a protocol explorer is) that hands off to the
          StageRail fork, which draws the path a number travels from the
          contracts to the page and closes on where every number comes from. ═══ */}
        <div>
          <section className="max-w-7xl mx-auto px-4 py-16" data-anatomy="S7">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground mb-4">What Rails does</h2>

            {/* Copy constraints (rails-ops decisions 0006/0010) for this intro
              and the rail below: (1) for CURRENT state the live chain read
              SUPERSEDES the index — the Reconciled station's "checked against
              live state" is the LIFETIME-flows gate (flowsReconcile), not a
              claim that the two reads validate each other's current values;
              (2) withholding is scoped to LIFETIME figures only — current
              state is never withheld; (3) the chain overlay is a second-wave
              fetch that lands AFTER first render — don't imply it runs before
              the page shows anything. */}
            <p className="body-text max-w-3xl">
              Each Rails explorer covers one DeFi protocol, from lending markets and vaults to savings and exchanges.
              Look up an address to see its positions, what they hold and every transaction behind them. Here is the
              path the data travels:
            </p>

            {/* The capability list became a transit-style rail: the four
              data-pipeline bullets were unordered, equal claims, but they are
              stages of ONE pipeline (Ethereum → Historic events ∥ Live state →
              Reconciled → On the page). The rail lets the structure carry the
              meaning — and preserves the fork: two paths leave the chain and
              meet again, which is the two-sources claim itself (what the
              Reconciled station may and may not claim is pinned by the
              constraints comment above). */}
            <StageRail />
          </section>
        </div>

        {/* ═══ TEAM — shared with the About page (single source of truth) ═══ */}
        <div data-anatomy="S8">
          <div className="max-w-7xl mx-auto px-4 py-16">
            <TeamSection
              aside={
                // Get in touch as the third column, after the members, its
                // heading at the names' size and its text at the bios'
                // (S9, Miles 6 Nov 2026); the Telegram handle beside the
                // heading as the names' handles sit; the glyph, in the link's pink, says
                // Telegram, so no @.
                <div data-anatomy="S9">
                  <p className={TEAM_LINE}>
                    <span className={TEAM_NAME}>Get in touch</span>{" "}
                    <a
                      href="https://t.me/railsfinance"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="railsfinance on Telegram"
                      className="text-pink-500 hover:underline underline-offset-2"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden="true"
                        className="mr-1 inline-block align-[-1px]"
                      >
                        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                      </svg>
                      railsfinance
                    </a>
                  </p>
                  <p className="body-text mt-2 max-w-[55ch]">
                    Rails is open infrastructure for DeFi. If you&apos;re a protocol team or interested in learning
                    more, we&apos;d love to hear from you.
                  </p>
                </div>
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
