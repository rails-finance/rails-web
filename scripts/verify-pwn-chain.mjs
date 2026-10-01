// ============================================================================
// VERIFY: PWN chain assumptions for the small depth pass
// ============================================================================
//
// Read-only. PWN surfaces loan terms fixed at origination (no oracle, no HF,
// no liquidation — its matrix row rules those out); what the explorer DOES
// assert is verified here through independent paths:
//
//   1. Terms second path — the index's terms travel sieve's STRINGIFIED
//      decoded tuple through the copy worker's recursive-descent parse. Here
//      the raw LOANCreated log is fetched at the index's creation block and
//      decoded with a hand-declared ABI instead: lender, borrower,
//      expiration, collateral (category/address/id/amount), credit
//      (address/amount) and loanRepayAmount must match wei-exact.
//   2. Completeness + status — Etherscan scans of LOANCreated / LOANPaidBack
//      / LOANClaimed over the whole window; each loan's status re-derived
//      from chain events ALONE (defaulted claim → defaulted; paid back or
//      clean claim → repaid; else open) must match the index, and the chain's
//      created set must equal the index roster exactly (nothing missed,
//      nothing invented).
//   3. LOAN-token lane — ownerOf(loanId) on the LOAN NFT at the creation
//      block is the lender (the note IS the lender's claim); a closed loan's
//      note is burned at head (ownerOf reverts).
//   4. Collateral custody — at the creation block the SimpleLoan contract
//      itself escrows the collateral (ERC721 ownerOf; ERC1155/ERC20
//      balanceOf ≥ amount — archive reads); the open loan is still escrowed
//      at head.
//   5. Token Bundler contents — for bundle collateral, the card's
//      "contains …" footnote chain: tokensInBundle(id) at the creation block
//      is non-empty, the BUNDLER itself holds every wrapped asset at that
//      block, and the bundler's uri(id) is PWN's own metadata route (the
//      catalog identity in lib/pwn/asset-catalog.ts).
//   6. Fixed-interest identity — loanRepayAmount − credit principal equals
//      the index's fixed interest (the split the card renders), ≥ 0.
//   7. Default timing — a defaulted claim fires only after the deadline
//      (v1.1 expiration; v1.2/v1.3 creation + duration, both moved by any
//      extension).
//   8. v1.2 / v1.3 (item 212) — the same scans over the v1.2 and v1.3
//      SimpleLoan contracts, their LOANCreated terms hand-decoded (duration,
//      fixedInterestAmount, accruingInterestAPR); a repaid loan's credit
//      Transfer into the contract equals principal + principal × APR × whole
//      minutes ÷ 5,256,000,000 (the web's lib/pwn/economics.ts `accrueTo`); an
//      unsettled loan past its deadline reads status 4 (expired) from getLOAN,
//      the "defaulted, not yet claimed" the listing and book count.
//
// Run:  node scripts/verify-pwn-chain.mjs
// Env:  .env.local — ALCHEMY_URL (archive reads + pinned logs),
//       ETHERSCAN_API_KEY (window scans), RAILS_API_URL + API_BEARER_TOKEN
//       (the index roster)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createPublicClient, http, parseAbi, parseAbiItem, toEventSelector } from "viem";
import { mainnet } from "viem/chains";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
for (const key of ["ALCHEMY_URL", "ETHERSCAN_API_KEY", "RAILS_API_URL", "API_BEARER_TOKEN"])
  if (!env[key]) throw new Error(`${key} missing from .env.local`);

const client = createPublicClient({ chain: mainnet, transport: http(env.ALCHEMY_URL) });

// The protocol's own addresses (lib/pwn/asset-catalog.ts).
const SIMPLE_LOAN_V11 = "0x57c88d78f6d08b5c88b4a3b7bbb0c1aa34c3280a";
const SIMPLE_LOAN = {
  v11: SIMPLE_LOAN_V11,
  v12: "0x0773d5f2f7b3264a9eb285f085acccc53d5aaa4f",
  v13: "0x719a69d0dc67bd3aa7648d4694081b3c87952797",
};
const LOAN_TOKEN = "0x4440c069272cc34b80c7b11bee657d0349ba9c23";
const TOKEN_BUNDLER = "0x19e3293196aee99bb3080f28b9d3b4ea7f232b8d";
// Comfortably pre-dates the v1.1 deploy (first seeded loan is mid-2023).
const WINDOW_FROM = 16_500_000;

// Hand-declared v1.1 event ABI — deliberately NOT read from any repo module,
// so the decode is a genuinely independent second path.
const CREATED_V11 = parseAbiItem(
  "event LOANCreated(uint256 indexed loanId, (address lender, address borrower, uint40 expiration, (uint8 category, address assetAddress, uint256 id, uint256 amount) collateral, (uint8 category, address assetAddress, uint256 id, uint256 amount) asset, uint256 loanRepayAmount) terms, bytes32 indexed factoryDataHash, address indexed factoryAddress)",
);
const TOPIC_CREATED = toEventSelector(CREATED_V11);
// v1.2 and v1.3 share one Terms struct (pwn_contracts tags v1.2, v1.3).
const CREATED_V12 = parseAbiItem(
  "event LOANCreated(uint256 indexed loanId, bytes32 indexed proposalHash, address indexed proposalContract, uint256 refinancingLoanId, (address lender, address borrower, uint32 duration, (uint8 category, address assetAddress, uint256 id, uint256 amount) collateral, (uint8 category, address assetAddress, uint256 id, uint256 amount) credit, uint256 fixedInterestAmount, uint24 accruingInterestAPR, bytes32 lenderSpecHash, bytes32 borrowerSpecHash) terms, (address sourceOfFunds) lenderSpec, bytes extra)",
);
const TOPIC_CREATED_V12 = toEventSelector(CREATED_V12);
const TOPIC_TRANSFER = toEventSelector("Transfer(address,address,uint256)");
const APR_DENOMINATOR = 100n * 525_600n * 100n;
const GET_LOAN_V12 = parseAbi([
  "function getLOAN(uint256 loanId) view returns (uint8 status, uint40 startTimestamp, uint40 defaultTimestamp, address borrower, address originalLender, address loanOwner, uint24 accruingInterestAPR, uint256 fixedInterestAmount, (uint8 category, address assetAddress, uint256 id, uint256 amount) credit, (uint8 category, address assetAddress, uint256 id, uint256 amount) collateral, address originalSourceOfFunds, uint256 repaymentAmount)",
]);
const GET_LOAN_V11 = parseAbi([
  "function getLOAN(uint256 loanId) view returns ((uint8 status, address borrower, uint40 expiration, address loanAssetAddress, uint256 loanRepayAmount, (uint8 category, address assetAddress, uint256 id, uint256 amount) collateral) loan)",
]);
const TOPIC_PAID_BACK = toEventSelector("LOANPaidBack(uint256)");
const TOPIC_CLAIMED = toEventSelector("LOANClaimed(uint256,bool)");

const ERC721_ABI = parseAbi(["function ownerOf(uint256) view returns (address)"]);
const ERC1155_ABI = parseAbi([
  "function balanceOf(address, uint256) view returns (uint256)",
  "function uri(uint256) view returns (string)",
]);
const ERC20_ABI = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const BUNDLER_ABI = parseAbi([
  "function tokensInBundle(uint256 _bundleId) view returns ((uint8 category, address assetAddress, uint256 id, uint256 amount)[])",
]);

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};
const info = (msg) => console.log(`      ${msg}`);
const CATEGORY = { 0: "ERC20", 1: "ERC721", 2: "ERC1155" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (address, abi, functionName, args, blockNumber) =>
  client.readContract({ address, abi, functionName, args, ...(blockNumber ? { blockNumber } : {}) });

// Whether the SimpleLoan-escrow / bundler-holds custody claim holds at a block.
async function holds(holder, cat, asset, id, amount, blockNumber) {
  if (cat === "ERC721") {
    const owner = await read(asset, ERC721_ABI, "ownerOf", [BigInt(id)], blockNumber).catch(() => null);
    return owner != null && owner.toLowerCase() === holder;
  }
  if (cat === "ERC1155") {
    const bal = await read(asset, ERC1155_ABI, "balanceOf", [holder, BigInt(id)], blockNumber).catch(() => null);
    return bal != null && bal >= BigInt(amount);
  }
  const bal = await read(asset, ERC20_ABI, "balanceOf", [holder], blockNumber).catch(() => null);
  return bal != null && bal >= BigInt(amount);
}

// ── etherscan helper (free tier → serialize with a delay) ───────────────────
let lastEs = 0;
async function esLogs(params, attempt = 0) {
  const wait = 400 - (Date.now() - lastEs);
  if (wait > 0) await sleep(wait);
  lastEs = Date.now();
  const url =
    `https://api.etherscan.io/v2/api?chainid=1&module=logs&action=getLogs&page=1&offset=1000` +
    Object.entries(params)
      .map(([k, v]) => `&${k}=${v}`)
      .join("") +
    `&apikey=${env.ETHERSCAN_API_KEY}`;
  const res = await (await fetch(url)).json();
  if (res.status === "0" && /No records/i.test(res.message ?? "")) return [];
  // The free tier's 3-a-second limit is shared with any other script on the key.
  if (res.status === "0" && /rate limit/i.test(String(res.result)) && attempt < 3) {
    await sleep(1500);
    return esLogs(params, attempt + 1);
  }
  if (!Array.isArray(res.result)) throw new Error(`etherscan: ${JSON.stringify(res).slice(0, 200)}`);
  return res.result;
}

// ── The index roster ─────────────────────────────────────────────────────────
const idxRes = await fetch(`${env.RAILS_API_URL}/api/pwn/positions?limit=1000`, {
  headers: { Authorization: `Bearer ${env.API_BEARER_TOKEN}` },
});
if (!idxRes.ok) throw new Error(`index fetch failed: ${idxRes.status}`);
const { rows, total } = await idxRes.json();
// Non-empty gate first: rows.length === total is 0 === 0 on an empty roster, and
// every per-loan sweep below iterates `rows` — all of it would pass vacuously.
check("index roster non-empty", rows.length > 0, `${rows.length} loans`);
check("index roster fetched, one page covers it", rows.length === total, `${rows.length} of ${total} loans`);
const counts = rows.reduce((acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc), {});
info(`status split: ${JSON.stringify(counts)} · versions: ${[...new Set(rows.map((r) => r.version))].join(",")}`);

// ── 2. Completeness + chain-only status re-derivation ────────────────────────
const scan = (address, topic0) => esLogs({ address, topic0, fromBlock: WINDOW_FROM, toBlock: "latest" });
const createdLogs = [];
const paidBackLogs = [];
const claimedLogs = [];
for (const [version, address] of Object.entries(SIMPLE_LOAN)) {
  const created = await scan(address, version === "v11" ? TOPIC_CREATED : TOPIC_CREATED_V12);
  const paid = await scan(address, TOPIC_PAID_BACK);
  const claimed = await scan(address, TOPIC_CLAIMED);
  info(`${version} ${address}: ${created.length} created · ${paid.length} paid back · ${claimed.length} claimed`);
  createdLogs.push(...created);
  paidBackLogs.push(...paid);
  claimedLogs.push(...claimed);
}
const idOf = (topic) => String(BigInt(topic));
const chainCreated = new Set(createdLogs.map((l) => idOf(l.topics[1])));
const chainPaidBack = new Set(paidBackLogs.map((l) => idOf(l.topics[1])));
// loanId → the repayment's tx and time (v1.2/v1.3 accrual check).
const paidBackAt = new Map(
  paidBackLogs.map((l) => [idOf(l.topics[1]), { tx: l.transactionHash, ts: Number(l.timeStamp) }]),
);
// loanId → { defaulted, ts } from the claim's own topics + block timestamp.
const chainClaimed = new Map(
  claimedLogs.map((l) => [idOf(l.topics[1]), { defaulted: BigInt(l.topics[2]) === 1n, ts: Number(l.timeStamp) }]),
);
const idxIds = new Set(rows.map((r) => r.loanId));
check(
  "chain LOANCreated set == index roster (nothing missed, nothing invented)",
  idxIds.size > 0 && chainCreated.size === idxIds.size && [...chainCreated].every((id) => idxIds.has(id)),
  `${chainCreated.size} chain vs ${idxIds.size} index`,
);
info(`window scans: ${createdLogs.length} created · ${paidBackLogs.length} paid back · ${claimedLogs.length} claimed`);

for (const row of rows) {
  const claim = chainClaimed.get(row.loanId);
  const chainStatus = claim?.defaulted ? "defaulted" : chainPaidBack.has(row.loanId) || claim ? "repaid" : "open";
  check(
    `loan ${row.loanId}: status re-derived from chain events alone == index (${row.status})`,
    chainStatus === row.status && (claim?.defaulted === true) === row.defaulted,
    chainStatus,
  );
  // 7. A default is a clock event: the claim can only fire past the deadline
  // (an extension moves it later, so the struck one is the floor).
  const struckDue =
    row.dueKind === "expiration"
      ? Number(row.dueValue)
      : row.dueKind === "duration" && row.createdAt != null
        ? Number(row.createdAt) + Number(row.dueValue)
        : null;
  if (claim?.defaulted && struckDue != null)
    check(
      `loan ${row.loanId}: defaulted claim fired after the deadline`,
      claim.ts >= (row.latestDefaultAt ?? struckDue),
      `claim ${claim.ts} vs deadline ${row.latestDefaultAt ?? struckDue}`,
    );
}

// ── v1.2 / v1.3 per loan ─────────────────────────────────────────────────────

/** An unsettled loan past its deadline: the contract reads status 4 (expired),
 *  the listing's "defaulted, not yet claimed". Before it, status 2. */
async function checkUnclaimed(row, key, contract, abi, statusOf) {
  const deadline =
    row.latestDefaultAt ??
    (row.dueKind === "expiration" ? Number(row.dueValue) : Number(row.createdAt) + Number(row.dueValue));
  const got = await read(contract, abi, "getLOAN", [BigInt(row.loanId)]).catch(() => null);
  const status = got == null ? null : Number(statusOf(got));
  const past = deadline <= Date.now() / 1000;
  check(
    `${key}: getLOAN status at head is ${past ? "4 (expired: defaulted, not yet claimed)" : "2 (running)"}`,
    status === (past ? 4 : 2),
    `status ${status}, deadline ${deadline}`,
  );
}

async function verifyV12(row, key, blk, contract) {
  const logs = await client.getLogs({
    address: contract,
    event: CREATED_V12,
    args: { loanId: BigInt(row.loanId) },
    fromBlock: blk,
    toBlock: blk,
  });
  if (logs.length !== 1) {
    check(`${key}: exactly one ${row.version} LOANCreated log at the index's creation block`, false, `${logs.length}`);
    return;
  }
  const t = logs[0].args.terms;
  const collCat = CATEGORY[Number(t.collateral.category)];
  const mismatches = [
    ["lender", t.lender.toLowerCase(), row.lender],
    ["borrower", t.borrower.toLowerCase(), row.borrower],
    ["due kind", "duration", row.dueKind],
    ["duration", String(t.duration), row.dueValue],
    ["collateral category", collCat, row.collateralCategory],
    ["collateral asset", t.collateral.assetAddress.toLowerCase(), row.collateralAsset],
    ["collateral id", String(t.collateral.id), String(row.collateralId ?? t.collateral.id)],
    ["collateral amount", String(t.collateral.amount), row.collateralAmountRaw],
    ["credit asset", t.credit.assetAddress.toLowerCase(), row.creditAsset],
    ["credit amount", String(t.credit.amount), row.creditAmountRaw],
    ["fixed interest", String(t.fixedInterestAmount), row.fixedInterestAmountRaw],
    ["accruing APR", String(t.accruingInterestAPR), String(row.accruingInterestApr)],
  ].filter(([, chain, idx]) => String(chain) !== String(idx));
  check(
    `${key}: raw ${row.version} LOANCreated decode matches the index terms (duration, fixed, APR)`,
    mismatches.length === 0,
    mismatches.map(([f, c, i]) => `${f}: chain ${c} vs index ${i}`).join("; "),
  );

  const noteOwner = await read(LOAN_TOKEN, ERC721_ABI, "ownerOf", [BigInt(row.loanId)], blk).catch(() => null);
  check(`${key}: LOAN note owned by the lender at creation`, noteOwner?.toLowerCase() === row.lender, noteOwner ?? "");

  const escrowAmount = collCat === "ERC721" ? 1n : BigInt(row.collateralAmountRaw);
  check(
    `${key}: ${collCat} collateral escrowed with SimpleLoan ${row.version} at creation`,
    await holds(contract, collCat, row.collateralAsset, row.collateralId ?? "0", escrowAmount, blk),
  );

  // The repayment the page states: the credit Transfer into the loan contract
  // in the LOANPaidBack transaction, against the contract's sum.
  const paid = paidBackAt.get(row.loanId);
  if (paid) {
    const receipt = await client.getTransactionReceipt({ hash: paid.tx });
    const intoLoan = receipt.logs.filter(
      (l) =>
        l.address.toLowerCase() === row.creditAsset &&
        l.topics[0] === TOPIC_TRANSFER &&
        `0x${l.topics[2].slice(26)}`.toLowerCase() === contract,
    );
    const block = await client.getBlock({ blockNumber: receipt.blockNumber });
    const minutes = BigInt(Math.floor((Number(block.timestamp) - Number(row.createdAt)) / 60));
    const principal = BigInt(row.creditAmountRaw);
    const expected =
      principal +
      BigInt(row.fixedInterestAmountRaw ?? "0") +
      (principal * BigInt(row.accruingInterestApr ?? 0) * minutes) / APR_DENOMINATOR;
    const transferred = intoLoan.length === 1 ? BigInt(intoLoan[0].data) : null;
    check(
      `${key}: repayment transferred == principal + APR × ${minutes} minutes (the page's repaid figure)`,
      transferred === expected,
      `chain ${transferred ?? `${intoLoan.length} transfers`} vs sum ${expected}`,
    );
  }

  if (row.status === "open") {
    check(
      `${key}: open loan still escrowed at head`,
      await holds(contract, collCat, row.collateralAsset, row.collateralId ?? "0", escrowAmount, head),
    );
    await checkUnclaimed(row, key, contract, GET_LOAN_V12, (r) => r[0]);
  }
}

// ── Per-loan: terms decode, LOAN-token lane, custody, bundles ────────────────
const head = await client.getBlockNumber();
let bundleIdentityChecked = false;

for (const row of rows) {
  const key = `loan ${row.loanId} (${row.status})`;
  const blk = BigInt(row.createdBlock);
  const loanContract = SIMPLE_LOAN[row.version];
  if (!loanContract) {
    check(`${key}: a known SimpleLoan version`, false, String(row.version));
    continue;
  }
  if (row.version !== "v11") {
    await verifyV12(row, key, blk, loanContract);
    await sleep(250);
    continue;
  }

  // 1. The raw log at the index's coordinates, hand-decoded.
  const logs = await client.getLogs({
    address: SIMPLE_LOAN_V11,
    event: CREATED_V11,
    args: { loanId: BigInt(row.loanId) },
    fromBlock: blk,
    toBlock: blk,
  });
  if (logs.length !== 1) {
    check(`${key}: exactly one LOANCreated log at the index's creation block`, false, `${logs.length} logs`);
    continue;
  }
  const t = logs[0].args.terms;
  const collCat = CATEGORY[Number(t.collateral.category)];
  const mismatches = [
    ["lender", t.lender.toLowerCase(), row.lender],
    ["borrower", t.borrower.toLowerCase(), row.borrower],
    ["expiration", String(t.expiration), row.dueValue],
    ["collateral category", collCat, row.collateralCategory],
    ["collateral asset", t.collateral.assetAddress.toLowerCase(), row.collateralAsset],
    ["collateral id", String(t.collateral.id), String(row.collateralId ?? t.collateral.id)],
    ["collateral amount", String(t.collateral.amount), row.collateralAmountRaw],
    ["credit asset", t.asset.assetAddress.toLowerCase(), row.creditAsset],
    ["credit amount", String(t.asset.amount), row.creditAmountRaw],
    ["repay amount", String(t.loanRepayAmount), row.loanRepayAmountRaw],
  ].filter(([, chain, idx]) => String(chain) !== String(idx));
  check(
    `${key}: raw LOANCreated decode matches the index terms wei-exact`,
    mismatches.length === 0,
    mismatches.map(([f, c, i]) => `${f}: chain ${c} vs index ${i}`).join("; "),
  );

  // 6. The fixed-interest split the card renders.
  const interest = BigInt(t.loanRepayAmount) - BigInt(t.asset.amount);
  check(
    `${key}: repay − principal == index fixed interest, ≥ 0`,
    interest >= 0n && String(interest) === String(row.fixedInterestAmountRaw ?? interest),
    `${interest}`,
  );

  // 3. The LOAN NFT (id == loanId) is minted to the lender in the same tx.
  const noteOwner = await read(LOAN_TOKEN, ERC721_ABI, "ownerOf", [BigInt(row.loanId)], blk).catch(() => null);
  check(
    `${key}: LOAN note owned by the lender at creation`,
    noteOwner?.toLowerCase() === row.lender,
    noteOwner ?? "reverted",
  );
  if (row.closedBlock != null) {
    const headOwner = await read(LOAN_TOKEN, ERC721_ABI, "ownerOf", [BigInt(row.loanId)]).catch(() => null);
    check(`${key}: closed loan's note burned at head (ownerOf reverts)`, headOwner === null, headOwner ?? "");
  }

  // 4. Collateral escrow: the SimpleLoan contract holds it at creation.
  const escrowAmount = collCat === "ERC721" ? 1n : BigInt(row.collateralAmountRaw);
  check(
    `${key}: ${collCat} collateral escrowed with SimpleLoan at creation`,
    await holds(SIMPLE_LOAN_V11, collCat, row.collateralAsset, row.collateralId ?? "0", escrowAmount, blk),
  );
  if (row.status === "open") {
    check(
      `${key}: open loan still escrowed at head`,
      await holds(SIMPLE_LOAN_V11, collCat, row.collateralAsset, row.collateralId ?? "0", escrowAmount, head),
    );
    await checkUnclaimed(row, key, SIMPLE_LOAN_V11, GET_LOAN_V11, (r) => r.status);
  }

  // 5. Bundle collateral: the "contains …" custody chain.
  if (row.collateralAsset === TOKEN_BUNDLER) {
    const bundle = await read(TOKEN_BUNDLER, BUNDLER_ABI, "tokensInBundle", [BigInt(row.collateralId)], blk).catch(
      () => null,
    );
    check(
      `${key}: bundle #${row.collateralId} non-empty at creation`,
      (bundle?.length ?? 0) > 0,
      `${bundle?.length ?? 0} assets`,
    );
    if (bundle?.length) {
      let allHeld = true;
      for (const a of bundle) {
        const cat = CATEGORY[Number(a.category)] ?? "ERC20";
        // MultiToken encodes an ERC721 with amount 0 (the id names the one token).
        const amt = cat === "ERC721" ? 1n : a.amount;
        if (!(await holds(TOKEN_BUNDLER, cat, a.assetAddress, String(a.id), amt, blk))) {
          allHeld = false;
          info(`${key}: bundler does NOT hold ${cat} ${a.assetAddress} #${a.id}`);
        }
        await sleep(120);
      }
      check(`${key}: bundler holds every wrapped asset at creation (${bundle.length})`, allHeld);
      if (!bundleIdentityChecked) {
        bundleIdentityChecked = true;
        const uri = await read(TOKEN_BUNDLER, ERC1155_ABI, "uri", [BigInt(row.collateralId)]).catch(() => "");
        check("bundler identity: uri(id) is PWN's own metadata route", uri.includes("api.pwn.xyz/bundle"), uri);
      }
    }
  }
  await sleep(250);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
