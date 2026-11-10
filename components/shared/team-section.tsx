/**
 * Team — the two-person Rails team, rendered as a pair of profile cards.
 * Shared so the About page and the home page stay in lockstep (one source
 * of truth for names, bios, and handles). Renders the heading and the
 * members, and an optional third column after them (`aside`: home's "Get in
 * touch", ui-jobs 522); each page supplies its own section container / width.
 */

import type { ReactNode } from "react";
import Link from "next/link";

const H2 = "text-3xl font-semibold tracking-tight text-foreground";
const LINK = "text-pink-500 hover:underline underline-offset-2";

type Member = {
  name: string;
  handle: string;
  url: string;
  img: string;
  bio: string;
  /** Optional read-more link rendered after the bio. */
  journey?: { label: string; url: string };
};

const TEAM: readonly Member[] = [
  {
    name: "Miles",
    handle: "@milesessex",
    url: "https://x.com/milesessex",
    img: "/about-team-milesessex.jpg",
    bio: "Product designer with 20+ years experience. Focused on creating intuitive interfaces for complex financial data.",
    journey: {
      label: "My Rails journey...",
      url: "/blog/from-kitchen-table-sketches-to-rails-web-app",
    },
  },
  {
    name: "Slava",
    handle: "@slvdev",
    url: "https://x.com/slvdev",
    img: "/about-team-slvdev.jpg",
    bio: "Web3 developer with expertise in Rust and Solidity. Focused on building infrastructure that makes DeFi accessible.",
  },
];

/** A column's first line: a member's name and handle, or the aside's heading. */
export const TEAM_LINE = "text-lg";
export const TEAM_NAME = "font-medium text-foreground";

export function TeamSection({ aside }: { aside?: ReactNode }) {
  return (
    <div>
      <h2 className={`${H2} mb-6`}>The team</h2>

      {/* One column per member (Miles's mock, 5 Nov 2026): the square avatar,
          then one line, the name and the handle, then the bio; no roles, the
          bio says what each does (Miles, 6 Nov 2026). No card chrome. With an
          aside, three columns from lg, the aside last. Stacked below md. */}
      <div className={`grid gap-8 md:grid-cols-2 ${aside ? "lg:grid-cols-3" : ""}`} data-team-members="">
        {TEAM.map((m) => (
          <div key={m.name} className="flex items-start gap-5 md:gap-8" data-team-member="">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.img} alt={m.name} className="size-16 shrink-0 rounded-xl object-cover" />
            <div className="min-w-0">
              <p className={TEAM_LINE}>
                <span className={TEAM_NAME}>{m.name}</span>{" "}
                <a href={m.url} target="_blank" rel="noopener" className={LINK}>
                  {m.handle}
                </a>
              </p>
              {/* Bio measure capped at ~55ch so the line length stays
                  readable. */}
              <p className="body-text mt-2 max-w-[55ch]">
                {m.bio}
                {m.journey && (
                  <>
                    {" "}
                    {/* A page on Rails, so the link hue (color-grammar.md §4a), in this tab. */}
                    <Link
                      href={m.journey.url}
                      className="text-blue-600 transition-colors hover:underline dark:text-[var(--text-link)]"
                    >
                      {m.journey.label}
                    </Link>
                  </>
                )}
              </p>
            </div>
          </div>
        ))}
        {aside}
      </div>
    </div>
  );
}
