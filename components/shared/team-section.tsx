/**
 * Team — the two-person Rails team, rendered as a pair of profile cards.
 * Shared so the About page and the home page stay in lockstep (one source
 * of truth for names, bios, and handles). Renders only the heading + grid;
 * each page supplies its own section container / width.
 */

const H2 = "text-3xl font-semibold tracking-tight text-foreground";
const H3 = "text-lg font-semibold text-foreground";
const LINK = "text-pink-500 hover:text-pink-600 transition-colors";

type Member = {
  name: string;
  role: string;
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
    role: "Designer",
    handle: "@milesessex",
    url: "https://x.com/milesessex",
    img: "/about-team-milesessex.jpg",
    bio: "Product designer with 20+ years experience. Focused on creating intuitive interfaces for complex financial data.",
    journey: {
      label: "My Rails journey...",
      url: "https://rails.finance/blog/from-kitchen-table-sketches-to-rails-web-app",
    },
  },
  {
    name: "Slava",
    role: "Developer",
    handle: "@slvdev",
    url: "https://x.com/slvdev",
    img: "/about-team-slvdev.jpg",
    bio: "Web3 developer with expertise in Rust and Solidity. Focused on building infrastructure that makes DeFi accessible.",
  },
];

export function TeamSection() {
  return (
    <div>
      <h2 className={`${H2} mb-6`}>Team</h2>

      <div className="grid md:grid-cols-2 gap-8">
        {TEAM.map((m) => (
          <div key={m.name}>
            <div className="flex items-center mb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.img} alt={m.name} className="w-16 h-16 rounded-full mr-4 object-cover" />
              <div>
                <h3 className={H3}>{m.name}</h3>
                <p className="body-text">{m.role}</p>
                <a href={m.url} target="_blank" rel="noopener noreferrer" className={LINK}>
                  {m.handle}
                </a>
              </div>
            </div>
            {/* Bio measure capped at ~55ch so the line length stays readable
                while the two cards keep their grid positions. Arbitrary value
                rather than max-w-prose: that's Tailwind's 65ch default and this
                repo's @theme doesn't override --container-prose. */}
            <p className="body-text max-w-[55ch]">
              {m.bio}
              {m.journey && (
                <>
                  {" "}
                  <a href={m.journey.url} target="_blank" rel="noopener noreferrer" className={LINK}>
                    {m.journey.label}
                  </a>
                </>
              )}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
