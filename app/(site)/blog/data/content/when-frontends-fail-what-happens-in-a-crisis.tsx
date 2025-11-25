export default function WhenFrontendsFailWhatHappensInACrisis() {
  return (
    <>
      <p>The recent Aerodrome Finance and Velodrome Finance DNS incident reminds us again of a familiar problem. Users have a patchwork of tools to turn to in a crisis, but nothing that lets them check their positions with confidence.</p>

      <p><a href="https://rails.finance" target="_blank" rel="noopener noreferrer">Rails</a> provides the solution: an independent, read-only platform for safely checking your positions when frontends fail.</p>
      <h2>The 3:24 AM Panic Scenario</h2>

      <p>
        It's early. Your phone is buzzing with notifications. Someone has tagged @everyone in a protocol's Discord.
      </p>

      <figure style={{ textAlign: "center" }}>
        <img
          src="/blog/when-frontends-fail-what-happens-in-a-crisis-discord-message.png"
          alt="alexander — 22/11/2025, 03:24 — Investigating reports of front‑end issues. Please stand by."
          style={{ display: "block", margin: "0 auto" }}
        />
        <figcaption>First report of the issue on Discord at 3.24 AM.</figcaption>
      </figure>

      <p>You have meaningful exposure on the protocol. Your mind jumps straight to the questions that matter:</p>

      <ul>
        <li>Has an attacker already drained my position?</li>
        <li>How do I check safely, without connecting my wallet?</li>
        <li>If I need to exit, which interface is safe?</li>
        <li>Are alternative links legitimate or phishing?</li>
      </ul>

      <p>
        DNS hijacks have hit major DeFi protocols and multiple DEXs. When the frontend fails, the contracts continue
        running, but users lose visibility and anxiety rises.
      </p>

      <h2>Existing tools provide fragments of a solution</h2>

      <ul>
        <li>
          <strong>Decentralised frontends</strong> require wallet access to view positions
        </li>
        <li>
          <strong>Block explorers</strong> show on‑chain data without broader context
        </li>
        <li>
          <strong>Wallets and portfolio trackers</strong> show simplified position summaries
        </li>
        <li>
          <strong>Social channels</strong> provide rapid updates but no personalised insight or neutral verification
        </li>
      </ul>

      <p>
        Frontend failures also put pressure on teams, with moderators quickly overwhelmed. Providing a personalised breakdown to every user seeking help becomes a challenge.
      </p>

      <p>Across DEXs, lending markets, CDPs, and staking protocols, the same pitfalls exist.</p>

      <ul>
        <li>Contracts continue performing normally</li>
        <li>Fear spreads faster than facts</li>
        <li>Reliable information becomes scarce</li>
        <li>Users take unnecessary or harmful actions</li>
      </ul>

      <h2>How Rails serves protocols and their users in crisis-mode</h2>

      <p>DeFi needs a service during moments of stress that is <strong>Read‑only and safe</strong> in high‑risk situations, <strong>Usable by non‑technical users</strong>, and <strong>Independent</strong> of protocol frontends.
      </p>

      <p>
        <strong>Rails is built for exactly these conditions</strong>:
      </p>

      <h3>✅ No wallet connection or login required</h3>
      <h3>✅ Clear explanations of essential information</h3>
      <h3>✅ Neutral and Open Source</h3>

      <p style={{ marginTop: "2rem" }}>
        Rails already provides read-only dashboards for{" "}
        <strong>
          <a href="https://docs.liquity.org/v2-faq" target="_blank" rel="noopener noreferrer">
            Liquity V2
          </a>
        </strong>
        , a protocol that <em>does not operate its own frontend</em>, instead enabling community-run, open-source
        frontends for increased decentralisation and censorship-resistance.{" "}
        <strong>Liquity is also an early supporter of Rails</strong> — underscoring their commitment to neutral,
        accessible tooling.
      </p>

      <p>
        For a first-class protocol explorer that will support <em>your</em> users, contact{" "}
        <a href="http://x.com/rails_finance" target="_blank" rel="noopener noreferrer">
          @rails_finance
        </a>
        .
      </p>
    </>
  );
}
