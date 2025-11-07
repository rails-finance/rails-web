export default function RailsSolutionDefiTrustProblem() {
  return (
    <>
      <p>
        After committing funds to a DeFi protocol, how do you independently verify your activity? Where should you go?
        Or more to the point, where would you recommend your 'normie' friend go?
      </p>

      <p>
        I believe that being able to evaluate what happens to assets in a protocol either before and after you interact
        with it should be much easier than it is.
      </p>

      <p>
        <strong>A new project — </strong>
        <a href="https://rails.finance/" target="_blank" rel="noopener noreferrer">
          <strong>Rails</strong>
        </a>
        <strong> — is on track to address this.</strong>
      </p>

      <h2>The information void</h2>

      <p>
        If you can conceptually understand a protocol, it doesn't immediately mean you'll identify what is going on
        within the transactions themselves and the full implications of market dynamics on your position. DeFi's
        transparency is often celebrated. Everything is on-chain. Anyone can verify. But verification isn't the same as
        understanding.
      </p>

      <p>
        Before committing funds, there's no easy way to see what actually happens in practice — how liquidations play
        out for real positions, what redemptions look like for other users, how these events affect the holdings
        involved.
      </p>

      <p>
        Protocol documentation explains general mechanisms. Block explorers, portfolio trackers, and wallets provide
        evidence that something happened — they show what you hold and basic transaction data. But nothing is
        interpreting your specific transactions or showing how they affected your position over time.
      </p>

      <p>
        For support Discord communities are genuinely helpful. But asking for help may mean sharing your wallet address
        — potentially exposing your complete financial activity to get answers about one transaction, attracting
        scammers in the process. Even when attempting to stay anonymous, the timing of your questions can be correlated
        with on-chain activity.
      </p>

      <p>
        What's missing is a trustworthy platform that provides this information. The technology exists — we're not
        lacking blockchain data or analytic capabilities. We're lacking the translation layer between protocol
        semantics and human understanding.
      </p>

      <h2>Why this matters beyond UX</h2>

      <p>
        Protocol complexity is increasing faster than our ability to evaluate it, this gap creates cascading problems
        throughout the ecosystem.
      </p>

      <p>
        <strong>Trust defaults to the wrong signals.</strong> Without understanding, users rely on social proof.{" "}
        <a
          href="https://link.springer.com/article/10.1007/s11142-024-09838-4"
          target="_blank"
          rel="noopener noreferrer"
        >
          Research
        </a>{" "}
        from Indiana University's Kelley School analyzing 36,000 tweets from 180 top crypto influencers found that
        initial positive returns of 1.83% disappear by day five and produce -6.53% returns by day 30. Yet influencer
        recommendations remain dominant because understanding isn't readily available as an alternative.
      </p>

      <p>
        <strong>Intermediaries are filling the gap. </strong>DeFi promised direct interaction with financial protocols
        — users directly controlling their financial interactions. But users are increasingly relying on managed
        services to navigate the ecosystem. We're building a better financial system but recreating the same dependency
        structures. That's not to say there is no room for the intermediary — for some, perhaps most, they are a
        valuable layer. But we should elevate the knowledge of how these protocols work so that at the very least there
        is a resource that can empower users to act independently with confidence should they wish to.
      </p>

      <p>
        <strong>Learning becomes difficult. </strong>Users can't learn from their own activity if they don't understand
        what happened. They can't compare their decisions to alternatives or evaluate whether outcomes matched
        expectations.
      </p>

      <p>
        <strong>Protocols bear support costs too.</strong> <i>"What happened to my transaction?"</i> becomes a constant support
        burden. It may be impossible to quantify the users who abandon attempts at using DeFi out of confusion, not
        dissatisfaction with protocol functionality.
      </p>

      <p>
        Until we address the information accessibility problem, the ecosystem remains accessible primarily to technical
        users — working against its decentralization ethos.
      </p>

      <h2>Bridging the infrastructure gap</h2>

      <p>
        Ecosystem infrastructure emerged to solve specific trust and transparency problems through independent, credibly
        neutral services like L2Beat, DeFiLlama, Etherscan, Rated, GrowThePie, and Dune. They largely address the
        builders and the more technically minded. It's time we met the users on their level and widen the path to
        adoption.
      </p>

      <p>
        What's missing is protocol-specific intelligence that explains what happened in your specific transaction.
        Opening a leveraged position, getting affected by a redemption, adjusting your collateral ratio — the
        infrastructure exists to verify these events occurred, but not to explain what they mean for your position.
      </p>

      <p>
        <a href="https://rails.finance/" target="_blank" rel="noopener noreferrer">
          <strong>Rails</strong>
        </a> aims to bridge this gap, providing a <em>user-focused </em>analytics platform that provides independent interpretation of your protocol
        activity. Maintaining the same credible neutrality as other ecosystem tools. It takes complex blockchain data
        and transforms it into clear, actionable insights and rich, detailed explanations of your specific transactions
        without requiring a wallet connection or private keys. By providing this transaction-level explanation, Rails
        naturally becomes self-service support infrastructure for DeFi.
      </p>

      <p>
        Currently in alpha,{" "}
        <a href="https://rails.finance/" target="_blank" rel="noopener noreferrer">
          Rails
        </a>{" "}
        is focused solely on providing deep analytics for the{" "}
        <a href="http://liquity.org/" target="_blank" rel="noopener noreferrer">
          Liquity V2 protocol
        </a>{" "}
        on Ethereum mainnet, with plans to expand to its ecosystem of "friendly forks" and other protocols. Rails is
        seeking grant funding to accelerate this development.
      </p>
    </>
  );
}
