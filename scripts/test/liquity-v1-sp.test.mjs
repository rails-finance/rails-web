// lib/liquity-v1/sp-*.ts — a Liquity V1 stability-pool deposit on the index's
// and the chain's raw integers (rails-ops reference/liquity-v1-stability-pool.md).
// The fixture is a whole deposit as rails-server's
// /api/liquity-v1/stability-pool/timeline serves it (mig 499, read from a copy
// of kings-cross's tables on 20 Nov 2026): twelve touches by
// 0x8aad…8b12, tagged at its open, with a claim, a gain sent to its Trove and
// a full withdrawal.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  barTotal,
  depositGap,
  depositLegs,
  depositLifetime,
  depositNow,
  depositNowFromChain,
  exactUnits,
  isTagged,
  poolShare,
  priceUnits,
} from "../../lib/liquity-v1/sp-math.ts";
import { spHeadFigures } from "../../lib/liquity-v1/sp-chain-read.ts";
import { spEventLabel, spEventSentences } from "../../lib/liquity-v1/sp-event-prose.ts";
import { liquityV1DepositHref, normalizeDepositor } from "../../lib/liquity-v1/sp-routes.ts";

const WALLET = "0x8aad71ecd4712c48d6443718009f73e580148b12";
const TAG = "0x30e5d10dc30a0ce2545a4dbe8de4fcba590062c5";

// operation | deposit_before | deposit_after | deposit_loss | top_up_or_withdrawal | eth_gain | lqty_gain
const ROWS = `provideToSP|0|821684368779740276586184|0|821684368779740276586184|0|0
withdrawFromSP|821684368779740276586184|821614352902612329163283|70015877127947422901|0|43997723553404051|422323965033296783418
provideToSP|821614352902612329163283|994513938109518283019851|0|172899585206905953856568|0|145527934328930154560
provideToSP|994513938109518283019851|994514096754545450843909|0|158645027167824058|0|210122755773124540201
provideToSP|994514096754545450843909|1981392909146542399920114|0|986878812391996949076205|0|61690943133288436
provideToSP|1981392909146542399920114|2381392953110709311404390|0|400000043964166911484276|0|482745326513114823589
withdrawFromSP|2381392953110709311404390|2381101295547497711795790|291657563211599608600|0|169051757203678952|2155801501218110904041
provideToSP|2381101295547497711795790|2504098417504435357112522|0|122997121956937645316732|0|675681169506284056
provideToSP|2504098417504435357112522|2703483316675755420713613|0|199384899171320063601091|0|1122767051575223849910
withdrawETHGainToTrove|2703483316675755420713613|2703182778422451968738715|300538253303451974898|0|174754075080119069|2255360590531749414760
provideToSP|2703182778422451968738715|2707153321836669573492056|0|3970543414217604753341|0|444801784719174399
withdrawFromSP|2707153321836669573492056|0|140583400442203568631|-2707012738436227369923425|81962983278464651|2153060815717122873333`
  .split("\n")
  .map((line) => {
    const [operation, deposit_before, deposit_after, deposit_loss, top_up_or_withdrawal, eth_gain, lqty_gain] =
      line.split("|");
    return {
      depositor: WALLET,
      front_end: TAG,
      operation,
      deposit_before,
      deposit_after,
      deposit_loss,
      top_up_or_withdrawal,
      eth_gain,
      lqty_gain,
    };
  });

const POSITION = {
  depositor: WALLET,
  status: "closed",
  front_end: TAG,
  deposit_raw: "0",
  deposited_raw: "2707815533530312572498455",
  withdrawn_raw: "2707012738436227369923425",
  burned_raw: "802795094085202575030",
  eth_gain_raw: "469766539115666723",
  lqty_gain_raw: "8948892114588032090703",
};

test("every touch keeps the deposit identity: before − loss + change = after", () => {
  for (const r of ROWS) {
    assert.equal(
      BigInt(r.deposit_before) - BigInt(r.deposit_loss) + BigInt(r.top_up_or_withdrawal),
      BigInt(r.deposit_after),
    );
  }
});

test("the position's sums are the rows' sums, and deposited − withdrawn − burned is the recorded deposit", () => {
  const l = depositLifetime(POSITION);
  assert.equal(depositGap(l), BigInt(0));
  const legs = ROWS.map(depositLegs);
  const sum = (k) => legs.reduce((a, g) => a + g[k], BigInt(0));
  assert.equal(sum("deposited"), l.deposited);
  assert.equal(sum("withdrawn"), l.withdrawn);
  assert.equal(sum("burned"), l.burned);
  assert.equal(sum("eth"), l.ethGain);
  assert.equal(sum("lqty"), l.lqtyGain);
  assert.equal(barTotal(legs), BigInt(ROWS.at(-1).deposit_after));
});

test("labels: an open, a claim, a top-up, a gain sent to the Trove and a full withdrawal", () => {
  const labels = ROWS.map(spEventLabel);
  assert.equal(labels[0], "Opened");
  assert.equal(labels[1], "Claimed");
  assert.equal(labels[2], "Deposited");
  assert.equal(labels[9], "ETH to Trove");
  assert.equal(labels[11], "Withdrew all");
});

test("sentences: the open names its front end; the Trove touch says where the ETH went", () => {
  const open = spEventSentences(ROWS[0]);
  assert.ok(open.some((s) => s.includes("0x30e5…62c5") && s.includes("LQTY")));
  const trove = spEventSentences(ROWS[9]);
  assert.ok(trove.some((s) => s.includes("0.174754075080119069 ETH") && s.includes("Trove")));
  assert.ok(trove.some((s) => s.includes("300.538253303451974898 LUSD") && s.includes("burned")));
  const untagged = spEventSentences({ ...ROWS[0], front_end: "0x0000000000000000000000000000000000000000" });
  assert.ok(untagged.includes("The deposit opened through no front end."));
  const still = spEventSentences({ ...ROWS[1], deposit_loss: "0", eth_gain: "0", lqty_gain: "0" });
  assert.deepEqual(still, ["The touch moved nothing."]);
});

test("the chain read: the pending figures, and null where the chain saw a touch the index has not", () => {
  const chain = {
    compoundedRaw: "900",
    recordedRaw: "1000",
    frontEnd: TAG,
    ethGainRaw: "5",
    lqtyGainRaw: "7",
  };
  const now = depositNowFromChain(chain);
  assert.equal(now.now, BigInt(900));
  assert.equal(now.pendingLoss, BigInt(100));
  assert.equal(now.pendingEth, BigInt(5));
  assert.equal(now.pendingLqty, BigInt(7));
  const l = depositLifetime({ ...POSITION, deposit_raw: "1000" });
  assert.notEqual(depositNow(l, chain), null);
  assert.equal(depositNow(depositLifetime(POSITION), chain), null);
});

test("spHeadFigures: deposits() is (initialValue, frontEndTag); a failed getter makes the read stale", () => {
  const okR = (result) => ({ status: "success", result });
  const fig = spHeadFigures([
    okR(BigInt(900)),
    okR([BigInt(1000), "0x30E5D10DC30A0CE2545A4DBE8DE4FCBA590062C5"]),
    okR(BigInt(5)),
    okR(BigInt(7)),
    { status: "failure" },
    okR(BigInt("2000000000000000000000")),
    okR(BigInt(123456)),
  ]);
  assert.equal(fig.recordedRaw, "1000");
  assert.equal(fig.frontEnd, TAG);
  assert.equal(fig.priceRaw, "2000000000000000000000");
  assert.equal(fig.priceStale, true);
  assert.equal(fig.totalDepositsRaw, "123456");
  assert.equal(priceUnits(fig.priceRaw), 2000);
  assert.equal(spHeadFigures([okR(BigInt(1)), { status: "failure" }, okR(BigInt(0)), okR(BigInt(0))]), null);
});

test("helpers: exact units, pool share, the tag test and the routes", () => {
  assert.equal(exactUnits(BigInt("1500000000000000000")), "1.5");
  assert.equal(poolShare(BigInt(25), BigInt(100)), 0.25);
  assert.equal(poolShare(BigInt(25), BigInt(0)), null);
  assert.equal(isTagged(TAG), true);
  assert.equal(isTagged("0x0000000000000000000000000000000000000000"), false);
  assert.equal(normalizeDepositor("0x8AAD71ECD4712C48D6443718009F73E580148B12"), WALLET);
  assert.equal(normalizeDepositor("nope"), null);
  assert.equal(liquityV1DepositHref(WALLET), `/ethereum/liquity-v1/stability-pool/${WALLET}`);
});
