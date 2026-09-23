// The branches page stopped listing redemption queues on 2026-08-29. The claim
// that replaced them is that the LISTING is the queue — the branch facet, the
// open status and an interest-rate sort — and the page now hands the reader a
// link built from three per-explorer param names (`LiquityForkUrlWiring`).
//
// Nothing else can catch that link going wrong. Rename a sort value, change a
// status wire value, and the URL still resolves: the listing simply ignores the
// param it doesn't recognise and serves its DEFAULT view. The page looks fine
// and quietly shows the wrong troves. Fails-safe here is fails-silent, so this
// asserts the link's result against the protocol's own queue.
//
// The check: for each branch, take the troves at the front of the chain-read
// queue (/api/chain/<proto>/branches — still built, since the branch card's
// rate span, average rate and TCR are read off the same walk), then follow the
// page's own "<SYM> queue →" link and read the trove ids the listing renders.
//
//   • SET membership, not sequence. Within one rate the protocol's linked list
//     has an order the index's ORDER BY does not reproduce, and neither is
//     wrong. Demanding identical sequences would fail for a reason that is not
//     a defect — and a check that cries wolf gets muted.
//   • The rate sequence must be NON-DECREASING down the listing. This is what
//     actually falsifies a broken sort: on the default view (recency) it is not.
//   • Both samples must be non-empty. An empty comparison passes every
//     assertion about its contents while proving nothing.
//
// Usage: BASE=http://localhost:3000 node scripts/verify/verify-branch-queue-link.mjs
//        PROTOS=liquity-v2,ebisu to narrow it.

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
/** How many of the queue's front troves to compare. The listing pages at 20. */
const SAMPLE = Number(process.env.SAMPLE ?? 12);
/** The listing's page size — a full page means there is a page 2 behind it. */
const PAGE_SIZE = Number(process.env.PAGE_SIZE ?? 20);

const EXPLORERS = {
  "liquity-v2": { branchesPath: "/ethereum/liquity-v2/branches", chainApi: "/api/chain/liquity-v2/branches" },
  ebisu: { branchesPath: "/ethereum/ebisu/branches", chainApi: "/api/chain/ebisu/branches" },
  asymmetry: { branchesPath: "/ethereum/asymmetry/branches", chainApi: "/api/chain/asymmetry/branches" },
  basedollar: { branchesPath: "/base/basedollar/branches", chainApi: "/api/chain/basedollar/branches" },
};

const only = process.env.PROTOS?.split(",").map((s) => s.trim());
const targets = Object.entries(EXPLORERS).filter(([k]) => !only || only.includes(k));

let failures = 0;
function assert(cond, msg) {
  if (cond) {
    console.log("    ok:", msg);
  } else {
    console.log("    FAIL:", msg);
    failures++;
  }
}

/** Trove ids as the listing renders them: a shortened `123456…7890` chip. The
 *  queue's ids are full uint256 strings, so compare on the same shortening the
 *  card applies rather than on the raw value. */
const short = (id) => (id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id);

const browser = await chromium.launch({ channel: "chrome" });

for (const [proto, cfg] of targets) {
  console.log(`\n=== ${proto}`);

  const res = await fetch(BASE + cfg.chainApi);
  if (!res.ok) {
    console.log(`    FAIL: ${cfg.chainApi} → HTTP ${res.status}`);
    failures++;
    continue;
  }
  const data = await res.json();
  const branches = (data.branches ?? []).filter((b) => !b.stale && (b.queue?.length ?? 0) > 0);
  assert(branches.length > 0, `${proto} has at least one branch with a queue to check`);

  const page = await browser.newPage();
  await page.goto(BASE + cfg.branchesPath, { waitUntil: "networkidle" });

  // The queue rows must be GONE — this is the change under test, and a page
  // still drawing them would pass every assertion below.
  const columnHeads = await page.locator("text=/Redeemed before it/i").count();
  assert(columnHeads === 0, `${proto} branches page renders no queue rows`);

  for (const branch of branches) {
    const sym = branch.symbol;
    console.log(`  -- ${sym}`);

    const link = page.locator(`a:has-text("${sym} queue")`).first();
    const hasLink = (await link.count()) > 0;

    // A branch whose sorted list is empty must offer NO link: its only queue
    // members are zombies, which the link excludes, so the link would open an
    // empty listing under a heading promising that branch's queue.
    if (branch.listedCount === 0) {
      assert(!hasLink, `${sym}: sorted list empty (${branch.queue.length} zombie(s)) — no queue link offered`);
      continue;
    }
    assert(hasLink, `${sym}: the branches page offers a "${sym} queue →" link`);
    if (!hasLink) continue;
    const href = await link.getAttribute("href");

    const listing = await browser.newPage();
    await listing.goto(BASE + href, { waitUntil: "networkidle" });
    await listing.waitForTimeout(1200);

    // The listing must have HONOURED the selection, not fallen back to its
    // default view. Its own chips are the page's statement of what it applied.
    const chips = await listing.locator("text=/Collateral:|Branch:|Status:/i").allTextContents();
    assert(
      chips.some((c) => c.includes(sym)),
      `${sym}: the listing shows a collateral/branch chip naming ${sym} (link honoured, not ignored)`,
    );

    // (id, rate) read off ONE row each, so the pairing can't slip — two
    // independent locators would silently mis-align the moment a card lacked
    // one of them.
    //
    // The rate comes from the footnote ELEMENT whose whole text is the rate,
    // never from a regex over the row: a card's text nodes concatenate without
    // separators ("Debt10.1k1.5% interest rate"), so a pattern scanning the row
    // silently reads a debt figure's digits into the rate and the check goes
    // green on a number that was never on the page.
    const listed = await listing.locator("a.group\\/listing-row").evaluateAll((els) =>
      els.map((el) => {
        const id = el.querySelector("span.font-mono")?.textContent?.trim() ?? null;
        let rate = null;
        for (const node of el.querySelectorAll("*")) {
          const m = node.textContent
            .replace(/\s+/g, " ")
            .trim()
            .match(/^([\d.]+)% interest rate$/);
          if (m) rate = Number(m[1]);
        }
        return { id, rate };
      }),
    );
    const listRows = listed.filter((r) => r.id && r.rate != null);

    // ZOMBIES COME OFF THE CHAIN SIDE TOO. The link selects open troves only
    // (see queueHref's note), so comparing against a queue that leads with
    // zombies fails for a difference the link is deliberately making. The
    // asymmetry cbBTC18 branch is the shape that proves it: queue 1, listed 0 —
    // its whole "queue" is one zombie, and the link correctly returns nothing.
    const chainAll = branch.queue.filter((e) => !e.zombie);
    // Rates round to the card's 2dp on BOTH sides before anything compares
    // them. The chain hands back 8.500000001 where the card renders "8.5", and
    // an unrounded band boundary puts one source's trove on each side of a line
    // the other source thinks it is exactly on.
    const round2 = (r) => Math.round(r * 100) / 100;
    const chainRows = chainAll
      .slice(0, SAMPLE)
      .map((e) => ({ id: short(e.troveId), rate: round2(e.annualInterestRatePct) }));

    if (chainRows.length === 0) {
      assert(
        listRows.length === 0,
        `${sym}: the sorted list is empty (queue is ${branch.queue.length} zombie(s)) and the link returns nothing`,
      );
      await listing.close();
      continue;
    }
    assert(listRows.length > 0, `${sym}: the listing rendered troves to compare (sample not empty)`);

    // Both lists are PREFIXES — the chain sample stops after SAMPLE troves, the
    // listing after one page — and either may cut through the middle of a tie
    // group. Where both are complete, compare the whole sets. Where they are
    // not, compare only the rate band below the lower of the two cut rates:
    // there both hold every trove there is, so any difference is a real defect,
    // while at or above it membership is an artefact of where each stopped and
    // comparing would fail for a reason that is not a defect.
    if (listRows.length > 0) {
      const chainComplete = !branch.queueCapped && chainAll.length <= SAMPLE;
      const listComplete = listRows.length < PAGE_SIZE;
      const [chainCmp, listCmp, where] =
        chainComplete && listComplete
          ? [chainRows.map((r) => r.id), listRows.map((r) => r.id), "in full"]
          : (() => {
              const band = Math.min(chainRows[chainRows.length - 1].rate, listRows[listRows.length - 1].rate);
              return [
                chainRows.filter((r) => r.rate < band).map((r) => r.id),
                listRows.filter((r) => r.rate < band).map((r) => r.id),
                `below ${band}%`,
              ];
            })();
      // A BAND THAT SELECTS NOTHING is not a failure of the page and not a
      // failure of this script — it is a branch whose whole front sits at ONE
      // rate, so both prefixes cut through the middle of one tie group and no
      // membership comparison at that rate can mean anything. Measured
      // 2026-09-20: WETH's first page is 20 troves all at 2.2% and wstETH's all
      // at 0.7%, and both branches went red on this guard while nothing was
      // wrong (TO-DO-ui-jobs §38).
      //
      // The run still has to say SOMETHING about those branches, or the guard
      // has only swapped a vacuous pass for an uninformative red. So the claim
      // narrows to the one that survives a tie-group cut: every trove the
      // LISTING shows is in the chain's queue. That holds whichever subset of a
      // tie each side stopped on, and a link selecting the wrong bucket still
      // breaks it.
      if (chainCmp.length === 0) {
        const queueIds = new Set(chainAll.map((e) => short(e.troveId)));
        const strayIds = listRows.map((r) => r.id).filter((id) => !queueIds.has(id));
        assert(
          strayIds.length <= branch.zombieCount,
          `${sym}: the front of the queue is one flat rate (${listRows[listRows.length - 1].rate}%), so instead: ` +
            `every listed trove is in the chain's queue — ${listRows.length} listed, ` +
            `${strayIds.length} not in it against ${branch.zombieCount} zombie(s)` +
            (strayIds.length ? ` — ${strayIds.join(", ")}` : ""),
        );
      } else {
        assert(true, `${sym}: there is a comparable set (${where}) — the check is not vacuous`);
      }
      const onlyChain = chainCmp.filter((id) => !listCmp.includes(id));
      const onlyList = listCmp.filter((id) => !chainCmp.includes(id));

      // The two directions mean different things, so they are asserted apart.
      //
      // QUEUE-ONLY is always a link defect: the sorted list holds a trove the
      // link's own result does not show, which is the link failing to reproduce
      // the queue.
      assert(
        onlyChain.length === 0,
        `${sym}: ${where} the link shows every trove in the queue` +
          (onlyChain.length ? ` — missing ${onlyChain.join(", ")}` : ` (${chainCmp.length} compared)`),
      );

      // LISTING-ONLY is the index and the chain disagreeing about who is IN the
      // sorted list, which predates this link and no link can fix: the index
      // calls a trove open when its debt clears MIN_DEBT, while the chain keeps
      // it out of the list until its owner re-inserts it. Those troves are the
      // branch's zombies, so the count is the bound — more listing-only rows
      // than the branch has zombies cannot be explained that way and is a real
      // defect (a status filter selecting the wrong bucket looks exactly like
      // this). Named either way, so a growing divergence stays visible.
      if (onlyList.length > 0) console.log(`    note: ${sym}: listing-only ${onlyList.join(", ")}`);
      assert(
        onlyList.length <= branch.zombieCount,
        `${sym}: ${where} the listing's extra troves (${onlyList.length}) stay within the branch's ${branch.zombieCount} zombies`,
      );
    }

    // Rates must ascend. This is the assertion that goes red on a broken sort:
    // the listing's default order is recency, which is not rate-ordered.
    const rates = listRows.map((r) => r.rate);
    assert(rates.length > 0, `${sym}: the listing rendered interest rates to check the order on`);
    const nonDecreasing = rates.every((r, i) => i === 0 || r >= rates[i - 1]);
    assert(nonDecreasing, `${sym}: the listing's rates are non-decreasing (${rates.slice(0, 8).join(" → ")})`);

    await listing.close();
  }

  await page.close();
}

await browser.close();
console.log(failures === 0 ? "\nPASS" : `\nFAIL — ${failures} assertion(s)`);
process.exit(failures === 0 ? 0 : 1);
