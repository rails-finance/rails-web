import { GraduationCap, Wallet, Code2, ShieldAlert, type LucideIcon } from "lucide-react";

/**
 * Who Rails is for — the four readers, drawn on the home page's "DeFi for
 * everyone" band and on /about. Shared so the two pages say the same thing.
 * Renders the grid only; each page supplies its heading and container.
 */

type Reader = { icon: LucideIcon; label: string; lead: string; body: React.ReactNode };

const READERS: readonly Reader[] = [
  {
    icon: GraduationCap,
    label: "The DeFi Curious",
    lead: "Learn by example.",
    body: "See how DeFi works through real positions, before you risk any of your own money.",
  },
  {
    icon: Wallet,
    label: "The Active DeFi User",
    lead: "Stay on top of positions.",
    body: "Collateral, debt and liquidation risk, explained in plain language so you know exactly where you stand.",
  },
  {
    icon: Code2,
    label: "DeFi Teams",
    lead: "Support your users.",
    body: "Give them an independent, verifiable view of their positions, with full coverage of your protocol.",
  },
  {
    icon: ShieldAlert,
    label: "Crisis Support",
    lead: "When frontends fail.",
    body: (
      <>
        Your position lives on the chain, not on a protocol&apos;s servers, so Rails can still show it when their site
        goes dark.
      </>
    ),
  },
];

export function AudienceGrid({ columns = "lg:grid-cols-4" }: { columns?: string }) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 ${columns} gap-6`}>
      {READERS.map(({ icon: Icon, label, lead, body }) => (
        <div key={label} className="flex flex-col">
          <div className="flex items-center gap-2 mb-5">
            <Icon className="h-[18px] w-[18px] text-rb-500 shrink-0" aria-hidden="true" />
            <p className="text-xs font-medium tracking-[0.12em] uppercase text-rb-500">{label}</p>
          </div>
          <p className="body-text flex-1 mb-6">
            <span className="font-semibold text-foreground">{lead}</span> {body}
          </p>
        </div>
      ))}
    </div>
  );
}
