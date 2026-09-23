import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/shared/page-metadata";

export const metadata: Metadata = {
  title: "Technical Architecture",
  description:
    "The multi-layer architecture behind Rails — Sieve indexer, RabbitMQ, processors and materialized views, the chain-state refresher, and the API and frontend that serve it.",
  openGraph: {
    title: "Technical Architecture — Rails",
    description: "How Rails processes and serves blockchain data accurately, layer by layer.",
    url: `${SITE_URL}/about/architecture`,
    images: ["/og/home.png"],
  },
};

const H2 = "text-3xl font-semibold tracking-tight text-foreground";
const CARD = "rounded-xl border border-rb-200 dark:border-rb-800 bg-raised p-5";

/* System Components — the multi-layer stack. */
const COMPONENTS = [
  {
    n: 1,
    title: "Blockchain Indexer (Sieve)",
    lead: "Sieve — our in-house indexer — connects directly to Ethereum and Base and monitors every protocol's contracts in real-time.",
    points: [
      "Captures each protocol's own events — Trove and CDP operations, lending activity, spoke activity — across both chains",
      "Processes each protocol's native event types — Supply, Borrow, Repay, Withdraw, Liquidation, TroveOperation, Redemption, and more — as they're emitted",
      "Reads from Ethereum and Base through redundant RPC providers — a primary endpoint with automatic failover to a backup",
      "Fetches oracle prices from Chainlink for accurate USD valuations",
      "Routes events to the appropriate processing queues via RabbitMQ",
      "Maintains real-time synchronization with blockchain state",
    ],
  },
  {
    n: 2,
    title: "Message Queue (RabbitMQ)",
    lead: "Manages event flow and ensures reliable processing of all blockchain events.",
    points: [
      "Separate queues for different event types",
      "Guarantees event processing even during high load",
      "Enables a decoupled, scalable architecture",
    ],
  },
  {
    n: 3,
    title: "Processors & Materialized Views",
    lead: "Enrich raw events and pre-compute the heavy joins so reads stay fast.",
    points: [
      "Attach USD values and protocol-specific context to each event",
      "Write enriched history to Postgres",
      "Materialized views pre-compute positions and timelines so the API serves them cheaply",
    ],
  },
  {
    n: 4,
    title: "Chain-State Refresher",
    lead: "Reads current balances and risk straight from each protocol's contracts, independent of the event history.",
    points: [
      "A background worker batches reads across positions via Multicall3 on a short refresh",
      "Health factor, collateral factor, and live balances come from chain state, not inferred from events",
      "Keeps positions opened through swap aggregators — which skip a protocol's standard events — accurate on screen",
    ],
  },
  {
    n: 5,
    title: "API & Frontend",
    lead: "Stitches both data paths together and renders the result.",
    points: [
      "An Express API joins enriched history with live chain state",
      "The Next.js frontend renders timelines, positions, and event detail",
      "Read-only throughout — no wallet connection, no account, no private keys",
    ],
  },
  {
    n: 6,
    title: "Vault Position Census",
    lead: "Vault positions are a set, not a stream: who holds a vault's shares is established by a daily census of the vault's own transfers rather than inferred from events as they pass.",
    points: [
      "A whole-history sweep of every Transfer a catalogued vault has emitted names each address that ever held its shares, so the set is complete rather than sampled from a floor",
      "Each sweep is proven against the contract: the sum of every holder's balanceOf must equal totalSupply() at the sweep block, and a sweep that does not add up is refused and the previous census stands",
      "Value is priced once, at the census block, through the vault's own convertToAssets and the chain's Aave V3 oracle, and each figure carries the oracle and the block it came from",
      "Live figures on a card — shares, claim, share of the vault — are read from the contracts through Multicall3 per request, and the card states both blocks: the census's and the read's",
    ],
  },
];

export default function ArchitecturePage() {
  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 pt-32 pb-16">
      <Link
        href="/about"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-rb-500 hover:text-blue-500 transition-colors mb-8"
      >
        <ArrowLeft size={15} aria-hidden="true" />
        About
      </Link>

      <h1 className="font-sans font-semibold tracking-tight leading-tight text-foreground text-[clamp(28px,4.5vw,48px)] mb-6">
        Technical Architecture
      </h1>
      <p className="text-rb-500 text-lg leading-relaxed mb-12">
        Rails uses a multi-layer architecture to process and serve blockchain data efficiently and accurately. Two data
        paths run side by side — enriched event history and live chain state — and the API stitches them together.
      </p>

      <section>
        <h2 className={`${H2} mb-4`}>System Components</h2>
        <div className="space-y-4">
          {COMPONENTS.map((c) => (
            <div key={c.n} className={CARD}>
              <h3 className="text-lg font-semibold text-foreground mb-1">
                {c.n}. {c.title}
              </h3>
              <p className="text-rb-500 leading-relaxed mb-3">{c.lead}</p>
              <ul className="space-y-2 text-foreground leading-relaxed">
                {c.points.map((p) => (
                  <li key={p} className="flex gap-3">
                    <span className="text-rb-500 shrink-0">·</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <p className="text-foreground leading-relaxed mt-12">
        Rails is open source.{" "}
        <a
          href="https://github.com/rails-finance/rails-web"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-pink-500 transition-colors"
        >
          View on GitHub →
        </a>
      </p>
    </div>
  );
}
