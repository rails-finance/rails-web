import { GraduationCap, Wallet, Code2, ShieldAlert } from "lucide-react";
import { CoveredStats } from "@/components/home/covered-stats";
import { HomeHero } from "@/components/home/home-hero";
import { LiveExampleFrame } from "@/components/home/live-example-frame";
import { ProtocolRow } from "@/components/home/protocol-row";
import { StageRail } from "@/components/home/stage-rail";
import { TrackLines } from "@/components/home/track-lines";
import { TeamSection } from "@/components/shared/team-section";
import { getLiveExampleData } from "@/lib/home/live-example-data";
import { getCoveredPositions } from "@/lib/home/covered-positions-data";
import { getHomeStats } from "@/lib/home/home-stats-data";

// ISR — the page (and the live-example trove data fetched below) regenerates
// in the background at most hourly; every visitor gets the static render.
export const revalidate = 3600;

export default async function Home() {
  // Independent legs — the hero count, the live-example trove, and the
  // overview stats each hit a different roster/endpoint, so fetch them
  // concurrently rather than stacking their latency.
  const [liveExample, covered, stats] = await Promise.all([
    getLiveExampleData(),
    getCoveredPositions(),
    getHomeStats(),
  ]);
  return (
    <div className="min-h-screen">
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

        {/* Live example — a real trove in browser chrome; its hover pill
            links to the live position. */}
        <section className="pt-10 pb-12">
          <LiveExampleFrame data={liveExample} />
        </section>

        {/* The roster, counted — sits between the example and the directory so
            it reads off both: the position above was one of these, the tiles
            below are the protocols named. */}
        <section className="pb-12">
          <CoveredStats covered={covered} stats={stats} />
        </section>

        {/* Track lines graphic — the animated stripes bridge the counted
            roster above and the explorer tiles below. This stretch of the
            gradient is the constant floor (via == to), so the casing var
            matches it: `--background` light, which tracks the `to-background`
            stop above; dark must be the INLINED @theme rb-800 literal
            rgb(20 22 30), because the `dark:to-rb-800` gradient stop inlines
            the @theme value and never sees the html.dark override — and
            `var(--background)` in dark would resolve to rgb(23 27 36), a
            different tone from the floor it is meant to disappear into. */}
        <section className="pb-12 [--track-casing:var(--background)] dark:[--track-casing:rgb(20_22_30)]">
          <TrackLines />
        </section>

        {/* Explorer directory — one uniform row of tiles on the gradient's
            constant floor, directly above the "DeFi for everyone" band. */}
        <section className="pb-16">
          <ProtocolRow />
        </section>
      </div>

      {/* ═══ WHO IS RAILS FOR ═══ */}
      {/* A flat light sheet: the page alternates light/dark band by band rather
          than ramping continuously darker, so this steps UP off the hero floor
          and back DOWN into "What Rails Does". Flat, not a gradient — this band
          used to deepen into the same tone the hero already ended on, which
          left its bottom seam invisible and its top edge reading as an upward
          step in the middle of a downward ramp. The personas lead: the
          directory says what Rails covers, this says who it's for, and the
          capability list below answers the "how" for whoever they caught. */}
      <div className="bg-rb-50 dark:bg-rb-600">
        <div className="max-w-7xl mx-auto px-4 pt-16 pb-16">
          <div className="mb-6">
            <h2 className="font-sans font-semibold tracking-tight leading-tight mb-10 text-[clamp(24px,3.5vw,38px)]">
              <span className="marketing">DeFi</span> for everyone
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-5">
                <GraduationCap className="h-[18px] w-[18px] text-rb-500 shrink-0" aria-hidden="true" />
                <p className="text-xs font-medium tracking-[0.12em] uppercase text-rb-500">The DeFi Curious</p>
              </div>
              <p className="body-text flex-1 mb-6">
                <span className="font-semibold text-foreground">Learn by example.</span> Browse real protocol activity
                to see how DeFi works in practice — no capital required. Explore the ecosystem, follow live events as
                they happen, and build intuition for how positions behave before you commit any of your own money.
              </p>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-5">
                <Wallet className="h-[18px] w-[18px] text-rb-500 shrink-0" aria-hidden="true" />
                <p className="text-xs font-medium tracking-[0.12em] uppercase text-rb-500">The Active DeFi User</p>
              </div>
              <p className="body-text flex-1 mb-6">
                <span className="font-semibold text-foreground">Stay on top of positions.</span> Monitor collateral
                ratios, redemption exposure, yield earned, and liquidation risk — translated into plain language,
                computed straight from the chain rather than taken on faith from a dashboard. Know exactly where you
                stand.
              </p>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-5">
                <Code2 className="h-[18px] w-[18px] text-rb-500 shrink-0" aria-hidden="true" />
                <p className="text-xs font-medium tracking-[0.12em] uppercase text-rb-500">DeFi Teams</p>
              </div>
              <p className="body-text flex-1 mb-6">
                <span className="font-semibold text-foreground">Support your users.</span> Give your users a dedicated,
                verifiable window into their positions — one that holds up even where your own frontend can&apos;t
                reach. A Rails integration means full coverage for your protocol, and real answers for your users, not
                confusion.
              </p>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-5">
                <ShieldAlert className="h-[18px] w-[18px] text-rb-500 shrink-0" aria-hidden="true" />
                <p className="text-xs font-medium tracking-[0.12em] uppercase text-rb-500">Crisis Support</p>
              </div>
              <p className="body-text flex-1 mb-6">
                <span className="font-semibold text-foreground">When frontends fail.</span> DNS hijacks. Frontend
                outages. Contract exploits. The health factor you check on a protocol&apos;s own site lives on the
                chain, not on their servers — so when the usual interface goes dark, Rails still shows exactly where
                your position stands. No wallet, no exposure.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ WHAT RAILS DOES — the plain answer to "what is this thing?": two
          intro paragraphs (what a protocol explorer is, then that every number
          traces to the contracts) that hand off to the StageRail fork, which
          draws the path a number travels from the contracts to the page. ═══ */}
      <div className="bg-background">
        <section className="max-w-7xl mx-auto px-4 py-16">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground mb-4">What Rails Does</h2>

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
            Rails builds a read-only explorer for each DeFi protocol it covers. Look up any position &mdash; yours or
            anyone else&rsquo;s &mdash; and see what it holds, what it owes, and everything that has ever happened to
            it.
          </p>
          <p className="body-text max-w-3xl mt-3">
            Every number on the page traces back to the contracts it came from. Here is the path it travels:
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
      {/* Lifts to the rb-50 sheet, the same tone the persona band takes — the
          two are far apart, so the page reads as three alternating tones rather
          than five arbitrary ones. From here the close settles: sheet → band →
          the footer's canvas, each step its own tone. */}
      <div className="bg-rb-50 dark:bg-rb-600">
        <div className="max-w-7xl mx-auto px-4 py-16">
          <TeamSection />
        </div>
      </div>

      {/* ═══ GET IN TOUCH ═══ */}
      <GetInTouch />
    </div>
  );
}

/** Founding-supporter voice + Telegram contact line. Takes `band`, the middle
 *  tone: it sits between the Team sheet above and the footer's canvas below, so
 *  the page's last three surfaces are each distinct. Was `raised` — an
 *  elevation role for panels and inputs, which read as the same sheet as its
 *  neighbours at band scale. */
function GetInTouch() {
  return (
    <div className="bg-band">
      <div className="max-w-7xl mx-auto px-4 py-16">
        <h2 className="font-semibold tracking-tight leading-tight pb-4 text-[clamp(28px,4vw,42px)]">Get in touch</h2>

        {/* 55ch — the short end of the classic typographic measure, so line
            length stays readable instead of running the full container.
            Arbitrary value rather than max-w-prose: that's Tailwind's 65ch
            default and this repo's @theme doesn't override --container-prose. */}
        <p className="body-text max-w-[55ch]">
          Rails is open infrastructure for DeFi. Built as a public good. If you&apos;re a protocol team or a funder,
          we&apos;d love to hear from you.
        </p>
        <p className="body-text max-w-[55ch] mt-2">
          Telegram:{" "}
          <a
            href="https://t.me/railsfinance"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 align-middle text-pink-500 hover:text-pink-600 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
            </svg>
            @railsfinance
          </a>
        </p>
      </div>
    </div>
  );
}
