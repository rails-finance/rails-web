export default function IntroducingRailsFinance() {
  return (
    <>
      <p>
        Before you interact with any DeFi protocol, wouldn't you want to see how it actually works? Not just
        read the docs but see how real users are managing real positions?
      </p>

      <p>
        Rails is a transparency layer for DeFi protocols. Instead of reading documentation and hoping you
        understand, you can browse real positions, see real transactions, and watch how experienced users manage
        risk. Every redemption, every interest rate adjustment, every liquidation&mdash;all visible and explained in
        context. When you open a position yourself, Rails tracks your complete timeline. Every action you take,
        every event that affects your position, presented chronologically with clear explanations of what happened
        and why it matters.
      </p>

      <h2>A redemption example</h2>
<p>Let's look at <a href="https://rails.finance/trove/WETH/40095378890324002625149490754668196451863018148182123632866179105523781406581">a real event</a>: a redemption that cleared 27,802 BOLD of debt.</p>
<p>On Rails, you see this transaction with an orange "REDEMPTION" badge. The position's debt dropped from 96,131 BOLD to 68,329 BOLD. Collateral went from 61.28 wstETH to 55.7 wstETH. The collateral ratio actually improved from 301% to 385%.</p>

<figure>
  <img src="/blog/introducing-rails-finance.gif" alt="Walkthrough showing how to view and understand a redemption event in Rails" />
  <figcaption>Viewing a redemption event in Rails: Click to expand transaction details and see the underlying mechanics</figcaption>
</figure>
<p>Click to expand the details and you learn the underlying mechanics: A BOLD holder exchanged their BOLD for collateral at face value. This happens when BOLD trades below $1, making redemptions profitable for arbitrageurs.</p>
<p><strong>This is the beauty of <a href="http://liquity.org">Liquity V2's</a> design</strong>&mdash;redemptions are essential for keeping BOLD pegged to $1. When BOLD dips below a dollar, arbitrageurs profit by buying cheap BOLD and redeeming it for $1 worth of collateral. This buying pressure pushes BOLD back toward its peg. It's an elegant, automated mechanism that requires no governance or intervention.</p>
<p>The position got hit because it had a 4.2% interest rate&mdash;one of the lowest in the wstETH branch. Now you understand something crucial about how the protocol works: <strong>interest rate determines redemption risk</strong>. Low rate = low cost borrowing, but higher chance of redemption when the peg weakens. High rate = more expensive, but protection from redemptions.</p>
<p>After the redemption the borrower immediately increased their interest rate from 4.2% to 4.7%.</p>
<h2>See the patterns</h2>
<p>Look at the <a href="https://rails.finance/troves">Trove list</a> view. Notice interest rates with labels like "Summerstone" or "ARM"? That's a batch manager&mdash;a service that actively manages interest rates for you. Being able to judge the performance of these delegates will help you decide if you should manage rates yourself or delegate to a service.</p>
<p>See the closed Trove with 1.46 million BOLD debt? <a href="https://rails.finance/trove/WETH/86492959577850149240240812252549298434003808930398513838023494031629517707047">Check its timeline</a>. You can view its entire history&mdash;when it borrowed, how it adjusted rates, when it got redeemed, how it was closed. Every mechanic of the protocol visible in one position's lifecycle.</p>
<p>This is how you really understand a protocol: watching the underlying mechanics operate through real positions.</p>
<h2>Beyond raw data</h2>
<p>Traditional block explorers show you event logs and hex data. Rails shows you what those events actually mean.</p>
<p>The timeline view displays every action chronologically with visual icons. Borrows, interest rate adjustments, transfers, redemptions&mdash;all in sequence showing cause and effect. You see the mechanics in motion.</p>
<p>Rails also provides educational context. When viewing a redemption, there's a "How Redemptions Work" section explaining the mechanism. Links to common questions like "What happens if my Trove gets redeemed?" and "How can I stay protected?"</p>
<h2>Why this matters</h2>
<p>DeFi protocols are powerful but complex. Traditional approaches give you documentation and tutorials. Rails shows you something different: <strong>the actual mechanics operating in real positions</strong>.</p>
<p>See how the largest borrowers manage risk. Notice what interest rates actually protect from redemptions. Watch how positions respond when BOLD loses its peg. Understand the protocol through observed behavior, not theoretical examples.</p>
<h2>What you can do now</h2>
<p>Currently in beta, Rails currently supports <a href="http://liquity.org">Liquity V2</a> across all collateral types (WETH, wstETH, rETH). You can:</p>
<ul>
<li>Browse active Troves to see protocol mechanics in action</li>
<li>View any position's complete timeline by address or ENS name</li>
<li>Explore redemption patterns and borrowing strategies</li>
<li>Understand how the protocol actually works before risking capital</li>
</ul>
<p>Start with the <a href="https://rails.finance/troves">Trove list</a>. Filter by collateral type. Sort by interest rate or debt size. Click into positions and explore their timelines. See the mechanics operate through hundreds of real transactions.</p>
<p>Then decide if the protocol is right for you.</p>
<p>Try it: <a href="https://rails.finance/">rails.finance</a></p>
    </>
  );
}
