// The learn leaf of the /start stack (G6; rails-ops ui-jobs 478): "New to
// DeFi?" in five short sections, ending on the search and the way into browsing.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FrontDoorSearch } from "@/components/shared/front-door-search";

const H2 = "text-2xl font-semibold tracking-tight text-foreground mb-3";

const SECTIONS: { id: string; heading: string; body: string[] }[] = [
  {
    id: "defi",
    heading: "What is DeFi?",
    body: [
      "DeFi, short for decentralised finance, is lending, borrowing and saving run by programs on a blockchain. These programs are called smart contracts, and a protocol is one set of them.",
      "The rules are written into the contracts, and every transaction they handle is recorded on the chain, where anyone can read it.",
    ],
  },
  {
    id: "wallet",
    heading: "What is a wallet?",
    body: [
      "A wallet is an address on the chain: 0x followed by 40 letters and digits. Some addresses also have an ENS name, like name.eth, that points to them.",
      "Addresses are public, so anyone can look one up and see what it holds.",
    ],
  },
  {
    id: "position",
    heading: "What is a position?",
    body: [
      "A position is what a wallet has open in a protocol: a loan, or a deposit that earns.",
      "A loan is backed by collateral, the deposit that secures it, and what is owed is the debt. If the collateral's value falls to the liquidation price, the protocol can sell collateral to repay the debt.",
    ],
  },
  {
    id: "rails",
    heading: "How Rails reads it",
    body: [
      "Every number on a Rails page is read from the chain: from the protocol's contracts and the events they recorded.",
      "Click a figure to see where it came from. Rails only reads: there is nothing to sign and no wallet to connect.",
    ],
  },
];

export function LearnContent() {
  return (
    <div className="max-w-3xl" data-anatomy="G6">
      <h1 className="mb-10 font-sans font-semibold tracking-tight leading-tight text-foreground text-[clamp(28px,4.5vw,44px)]">
        New to DeFi?
      </h1>
      <div className="flex flex-col gap-10">
        {SECTIONS.map((s) => (
          <section key={s.id} aria-labelledby={`learn-${s.id}`}>
            <h2 id={`learn-${s.id}`} className={H2}>
              {s.heading}
            </h2>
            {s.body.map((p, i) => (
              <p key={i} className={`body-text ${i > 0 ? "mt-3" : ""}`}>
                {p}
              </p>
            ))}
          </section>
        ))}
        <section aria-labelledby="learn-try">
          <h2 id="learn-try" className={H2}>
            Try it
          </h2>
          <p className="body-text mb-4">Type a wallet address or an ENS name, or the name of a protocol.</p>
          <div className="relative z-20">
            <FrontDoorSearch size="lg" suggest />
          </div>
          <Link
            href="/start/browse"
            className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-blue-500 hover:underline"
            data-start-browse=""
          >
            Or start browsing
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </section>
      </div>
    </div>
  );
}
