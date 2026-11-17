// The learn intro of the /start stack (G6; rails-ops ui-jobs 478): "New to
// DeFi?" in four short sections, drawn above the browse question while it is
// the current level under /start/learn, and left out once it is answered.

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
      "Turn on Inspector in the profile menu, under Advanced, then click a figure to see where it comes from. Rails only reads: there is nothing to sign and no wallet to connect.",
    ],
  },
];

export function LearnContent() {
  return (
    <div data-anatomy="G6">
      <h2 className="mb-10 font-sans font-semibold tracking-tight leading-tight text-foreground text-[clamp(28px,4.5vw,44px)]">
        New to DeFi?
      </h2>
      <div className="flex max-w-3xl flex-col gap-10">
        {SECTIONS.map((s) => (
          <section key={s.id} aria-labelledby={`learn-${s.id}`}>
            <h3 id={`learn-${s.id}`} className={H2}>
              {s.heading}
            </h3>
            {s.body.map((p, i) => (
              <p key={i} className={`body-text ${i > 0 ? "mt-3" : ""}`}>
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
