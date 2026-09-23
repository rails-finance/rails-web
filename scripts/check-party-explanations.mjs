// check:parties — every PARTY a card renders must be explained in prose.
// ---------------------------------------------------------------------------
// The explanation copy charter's completeness rule is bidirectional, but it
// governs FIGURES: a number on the card has a sentence, a sentence has a number.
// Parties — the third-party actor who executed an event, the counterparty an
// ownership handover names — sit outside it. They render as a chip on the card
// and, on most explorers, are never mentioned in the prose at all. A reader
// sees "by 0x96c4…" and is told nothing about who that is relative to the
// position or what their presence implies.
//
// This gate closes that hole the way check:register and check:receipts close
// theirs: discover the surfaces from the code rather than a hand-maintained
// list, then assert the prose covers what the card shows.
//
// ── What counts as a party ──────────────────────────────────────────────────
// The two seams that exist in the shared card grammar (chain-truth-event.tsx):
//
//   externalActor — "someone other than the position owner executed this".
//                   A VERDICT about agency. Pink chip, dotted spine.
//   party         — a neutral named counterparty OF the event (Maker's give
//                   names the new owner, fx's transfer names the recipient).
//
// A protocol-specific counterparty that rides neither seam (a liquidator named
// only in a detail grid, say) is NOT discovered here. That is a known bound,
// not an oversight — widening it means teaching this script each protocol's own
// field names, and the two typed seams are where the shared grammar puts a
// party on a card today. Stated so the next reader doesn't mistake a green run
// for "every party everywhere is explained".
//
// ── What counts as explaining one ───────────────────────────────────────────
// A mention in a PROVENANCE file does not count. A receipt answers "how do you
// know?"; the charter's §7 review test is "would the learner miss it?" — that
// is the explanation surface's job. So only the explanation surfaces are
// scanned: lib/<proto>/explainer-clauses.tsx (the event pane) and
// components/protocol/<proto>/*-position-explanation.tsx (the position pane).
//
// Run: node scripts/check-party-explanations.mjs   (or `pnpm check:parties`)

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const COMPONENTS = "components/protocol";
const LIB = "lib";

/** Phrases per SEAM. Splitting these is the whole point of the gate.
 *
 *  ⚠️ The first version of this script used one shared phrase list and passed
 *  every protocol on the first run — a cannot-fail check. The reason is worth
 *  keeping: aave-v3 "passed" on a liquidation clause containing the word
 *  "liquidator". But a liquidator is a DIFFERENT party from the third-party
 *  actor the externalActor chip names, and a liquidation is a different event
 *  from the ordinary supply or repay row that chip appears on. Naming one
 *  explains nothing about the other.
 *
 *  So `liquidator` is deliberately absent from the externalActor set. The
 *  externalActor seam is a verdict about AGENCY — someone who is not the owner
 *  executed a routine action — and only prose about agency answers it. */
/** The card knows a third party acted because the row carried a signal — the
 *  `externalBy` prop, or the raw `txFrom`/`caller` fields that (as morpho's
 *  authorisedActorMechanic documents) ship ONLY on external rows, so their
 *  presence IS the verdict. An explanation surface that never reads any of them
 *  cannot be speaking about the actor, whatever vocabulary it happens to use.
 *
 *  This is the second half of the discriminator, and it is what separates
 *  makerdao — which says "authorise another address to do so on their behalf"
 *  as a generic `give` mechanic — from morpho, which says it BECAUSE this row
 *  had a third-party actor.
 *
 *  ⚠️ `ExternalActorSummary` / `externalActivity` matter for the POSITION pane,
 *  which receives the reduced summary as a prop while its PARENT is the thing
 *  that calls `summariseExternalActors`. Omitting them reported morpho's
 *  position bullet — the reference implementation of this very fact — as a gap,
 *  which would have sent someone to rewrite already-correct prose. Keying on
 *  the shared TYPE rather than a local variable name is what keeps this stable
 *  as other protocols adopt the seam. */
const ACTOR_SIGNAL =
  /externalBy|externalActor|ExternalActorSummary|externalActivity|summariseExternalActors|\btxFrom\b|\bpoolCaller\b|\bcaller\b|\binitiator\b|\bfunder\b|\btxTo\b/;

const AGENCY_PROSE = [
  /third[-\s]party/i,
  /someone other than/i,
  /another (account|address|party|wallet)/i,
  /on (the owner('|&rsquo;)?s|its owner('|&rsquo;)?s|their) behalf/i,
  /on behalf of/i,
  /\bauthoris\w*/i,
  /\bauthoriz\w*/i,
  /\bacting for\b/i,
  /\boperator\b/i,
  /\bexecuted (it|this|these)\b/i,
];

/** A match sitting inside a liquidation clause does not count. Nearly every
 *  explorer says "Cleared by a third-party liquidator" — which explains the
 *  LIQUIDATOR, a different party on a different event from the third-party
 *  actor whose chip appears on an ordinary supply or repay row. Counting it
 *  passed aave-v3, aave-v4, fluid and spark on prose that never once mentions
 *  the seam being checked. */
function matchesOutside(prose, re, near) {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let m;
  while ((m = g.exec(prose))) {
    if (!near || !near.test(prose.slice(Math.max(0, m.index - 60), m.index + 60))) return true;
  }
  return false;
}

/** The neutral `party` seam names a counterparty OF the event, and the chip's
 *  PREFIX says which role: the address a transfer moves to, the liquidator, the
 *  challenger, the batch manager. Each role is scored on its own words, so a
 *  pane that explains its liquidators cannot pass for a transfer chip it never
 *  mentions. A prefix missing from this table is a GAP, not a skip: a new chip
 *  role has to be taught here before the gate can say anything about it.
 *
 *  `notNear` skips a match with those words within 60 characters. The transfer
 *  role needs it because "another account" is also how an actor clause opens
 *  ("Another account executed this on the owner's behalf") and how liquidation
 *  clauses talk; before it, that actor clause passed Aave V3's transfer chip.
 *  The liquidation roles need their matches inside those clauses.
 *
 *  Roles are scored against RENDERED text (proseOf), never the source:
 *  `ctx.counterparty` is not a sentence, and scoring source let it pass. */
const PARTY_ROLES = [
  {
    role: "transfer",
    prefixes: ["to", "from"],
    notNear: /liquidat|executed|behalf/i,
    phrases: [
      /\bnew owner\b/i,
      /\brecipient\b/i,
      /\bsender\b/i,
      /\bcounterparty\b/i,
      /transferred to\b/i,
      /handed (over|to)\b/i,
      /\bchanged (hands|owners?)\b/i,
      /\bmoved wallets\b/i,
      /\banother (\w+ )?(account|wallet)\b/i,
    ],
  },
  { role: "liquidator", prefixes: ["by", "liquidated by", "seized by"], phrases: [/\bliquidator\b/i] },
  {
    role: "liquidated account",
    prefixes: ["borrower", "seized from", "repaid for"],
    phrases: [
      /\bborrower\b/i,
      /\bliquidated (account|position)\b/i,
      /\banother (\w+ )?(account|position)\b/i,
      /\btaken from\b/i,
    ],
  },
  { role: "challenger", prefixes: ["challenged by"], phrases: [/\bchalleng(er|ed)\b/i] },
  { role: "veto", prefixes: ["vetoed by"], phrases: [/\bveto\w*/i, /\bdenied\b/i] },
  { role: "delegate", prefixes: ["delegate"], phrases: [/\bbatch manager\b/i, /\bdelegat\w*/i] },
  // "via" also names a swap's venue (Aave V3's "via CoW Protocol").
  { role: "router", prefixes: ["via"], phrases: [/\brouter\b/i, /\bsettle(d|ment)\b/i] },
];

function read(p) {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function listDir(p) {
  try {
    return readdirSync(p);
  } catch {
    return [];
  }
}

/** Strip line and block comments. A code comment explaining a seam to the next
 *  developer is not prose the READER ever sees — counting it would let a
 *  well-commented card pass with a silent pane, which is exactly the failure
 *  this gate exists to catch. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
}

/** What a pane can actually SAY: JSX text runs and string literals, joined.
 *  Identifiers, property reads and variable names drop out, so `ctx.counterparty`
 *  and `const recipient` no longer read as the words "counterparty" and
 *  "recipient". Text split by an `{expr}` joins with a space, which keeps the
 *  60-character exclusion windows meaningful. */
function proseOf(src) {
  // Entities first: `&rsquo;` carries a semicolon, and the statement filter
  // below would otherwise drop every sentence with an apostrophe in it.
  const code = stripComments(src)
    .replace(/&(rsquo|lsquo|apos);/g, "'")
    .replace(/&\w+;/g, " ");
  const runs = [];
  // A run between `}` and `{` (or after an arrow's `>`) is as often code as JSX
  // text, so a run carrying statement, call or array syntax is dropped. A
  // leaked signature ("], meansNow: [ clause( function liquidationSlots(")
  // put the word "liquidation" beside Fluid's transfer sentence and hid it.
  for (const m of code.matchAll(/[>}]([^<>{}]+)(?=[<{])/g)) {
    if (/[a-z]{2}/i.test(m[1]) && !/[;=[\]]|\w\(|\bctx\.|\b(const|let|return|case|if|function)\b/.test(m[1])) {
      runs.push(m[1]);
    }
  }
  for (const m of code.matchAll(/"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) runs.push(m[1] ?? m[2]);
  return runs.join(" ").replace(/\s+/g, " ");
}

const protocols = listDir(COMPONENTS)
  .filter((d) => existsSync(join(COMPONENTS, d)) && listDir(join(COMPONENTS, d)).length > 0)
  .sort();

let pass = 0;
let gaps = 0;
const gapRows = [];
const noSeam = [];

for (const proto of protocols) {
  const compDir = join(COMPONENTS, proto);
  const compFiles = listDir(compDir).filter((f) => f.endsWith(".tsx"));

  // ── Discover the seams this protocol actually renders ────────────────────
  let hasExternalActor = false;
  let hasParty = false;
  const partyPrefixes = new Set();
  for (const f of compFiles) {
    const src = stripComments(read(join(compDir, f)));
    if (/externalBy=|externalActor:|externalActor=/.test(src)) hasExternalActor = true;
    // Every string literal a `prefix:` can take, including both arms of
    // `prefix: transferOut ? "to" : "from"`. The value stops at the spec's next
    // key, and a literal compared with `===` is a condition, not a prefix
    // (Dolomite's `ctx.eventType === "transfer_in" ? "from" : "to"`).
    for (const m of src.matchAll(/\bprefix:([^\n]*)/g)) {
      const value = m[1].split(/,\s*(address|prov|name|tone|ens)\s*:/)[0];
      for (const lit of value.matchAll(/(===?|!==?)?\s*"([^"]+)"/g)) if (!lit[1]) partyPrefixes.add(lit[2]);
    }
    // Both spellings of the spec key: `party: giveTo` and the shorthand
    // `party,` / `party }`. Matching only the first missed every header that
    // builds a local `party` and passes it through, which was most of them.
    if (/\bparty(:\s*(\{|[a-zA-Z])|\s*[,}])/.test(src)) hasParty = true;
  }
  if (!hasExternalActor && !hasParty) {
    noSeam.push(proto);
    continue;
  }

  // ── The two EXPLANATION panes, scored SEPARATELY ─────────────────────────
  // Pooling them hid a real hole: they answer different questions and a
  // protocol can carry one without the other.
  //
  //   event pane    (lib/<proto>/explainer-clauses.tsx) — who acted on THIS
  //                 event, and on what authority.
  //   position pane (*-position-explanation.tsx) — the operator PATTERN across
  //                 the position's whole history ("of those, 1,582 were
  //                 executed by an address other than the owner's").
  //
  // Morpho is the only explorer that does both, and it needed both: the event
  // clause explains one row, the position bullet explains why 99.3% of them
  // look that way. A reader given only the first still cannot tell whether the
  // position is bot-operated.
  // A family shares one clauses file (the Liquity forks read
  // lib/shared/liquity-fork-explainer-clauses.tsx), so fall back to whatever
  // clauses module the protocol's own event explainer imports.
  let eventPane = join(LIB, proto, "explainer-clauses.tsx");
  if (!existsSync(eventPane)) {
    for (const f of compFiles.filter((f) => f.endsWith("-event-explainer.tsx"))) {
      const m = read(join(compDir, f)).match(/from "@\/(lib\/[^"]*explainer-clauses)"/);
      if (m) eventPane = `${m[1]}.tsx`;
    }
  }
  const positionPanes = compFiles.filter((f) => f.endsWith("-position-explanation.tsx")).map((f) => join(compDir, f));

  const paneProse = {
    event: existsSync(eventPane) ? stripComments(read(eventPane)) : null,
    position: positionPanes.length > 0 ? positionPanes.map((f) => stripComments(read(f))).join("\n") : null,
  };
  const paneText = {
    event: existsSync(eventPane) ? proseOf(read(eventPane)) : null,
    position: positionPanes.length > 0 ? positionPanes.map((f) => proseOf(read(f))).join(" ") : null,
  };

  const checks = [];
  // The actor seam is asked of BOTH panes. The neutral `party` chip rides an
  // event card only, so it is asked of the event pane alone — scoring a
  // position pane on it would invent a gap that cannot exist.
  if (hasExternalActor) {
    checks.push(["externalActor", "event", AGENCY_PROSE, "who acted, and on what authority", true, /liquidat/i]);
    checks.push([
      "externalActor",
      "position",
      AGENCY_PROSE,
      "whether this position is operated by someone else",
      true,
      /liquidat/i,
    ]);
  }
  if (hasParty) {
    const unknown = [...partyPrefixes].filter((p) => !PARTY_ROLES.some((r) => r.prefixes.includes(p)));
    for (const p of unknown) {
      gaps++;
      gapRows.push({ proto, tag: "party/event", why: `chip prefix "${p}" has no role in PARTY_ROLES` });
      console.log(
        `GAP   ${proto.padEnd(12)} ${"party/event".padEnd(24)} chip prefix "${p}" has no role in PARTY_ROLES`,
      );
    }
    if (partyPrefixes.size === 0) {
      gaps++;
      gapRows.push({ proto, tag: "party/event", why: "renders a party chip whose prefix is not a string literal" });
      console.log(`GAP   ${proto.padEnd(12)} ${"party/event".padEnd(24)} party prefix is not a string literal`);
    }
    for (const r of PARTY_ROLES.filter((r) => r.prefixes.some((p) => partyPrefixes.has(p)))) {
      checks.push([`party(${r.role})`, "event", r.phrases, `who the ${r.role} party is`, false, r.notNear ?? null]);
    }
  }

  for (const [seam, pane, phrases, want, needsSignal, near] of checks) {
    // The actor seam's signal test reads code on purpose (a field read IS the
    // verdict), so its phrases stay on the stripped source; party roles have no
    // signal and are scored on what renders.
    const prose = seam.startsWith("party") ? paneText[pane] : paneProse[pane];
    const tag = `${seam}/${pane}`;
    if (prose === null) {
      gaps++;
      gapRows.push({ proto, tag, why: `no ${pane} pane exists` });
      console.log(`GAP   ${proto.padEnd(12)} ${tag.padEnd(24)} no ${pane} pane exists at all`);
      continue;
    }
    const matched = phrases.filter((re) => matchesOutside(prose, re, near));
    if (needsSignal && !ACTOR_SIGNAL.test(prose)) {
      gaps++;
      const near = matched.length > 0 ? "; nearby wording is a generic mechanic" : "";
      gapRows.push({ proto, tag, why: `never reads the third-party signal${near}` });
      console.log(`GAP   ${proto.padEnd(12)} ${tag.padEnd(24)} never reads the actor signal${near}`);
    } else if (matched.length === 0) {
      gaps++;
      gapRows.push({ proto, tag, why: `never says ${want}` });
      console.log(`GAP   ${proto.padEnd(12)} ${tag.padEnd(24)} never says ${want}`);
    } else {
      pass++;
      console.log(`PASS  ${proto.padEnd(12)} ${tag.padEnd(24)} explained (${matched.length} phrase form(s))`);
    }
  }
}

// ── The operator bullet's DENOMINATOR ───────────────────────────────────────
// `ext.total` counts EVENTS. Most position cards lead with a TRANSACTION
// count, and one transaction routinely emits several — 2,762 against 3,485
// reduced rows on the aave-v3 fixture. A bullet opening "Of those, " chains its
// proportion onto whatever bullet precedes it, so writing that choice by hand
// states events over transactions the moment the two disagree. It shipped that
// way on maple, dolomite and aave-v3.
//
// `operatorLead()` (lib/shared/external-actor.ts) compares the two figures at
// render time instead. This asserts every pane goes through it — a POSITIVE
// test, so a new explorer writing its own lead is caught, not merely an old one
// regressing. Scored apart from the seam checks: it is a correctness rule about
// a number, not a completeness rule about prose.
let leadPass = 0;
for (const proto of protocols) {
  const compDir = join(COMPONENTS, proto);
  for (const file of listDir(compDir).filter((f) => f.endsWith("-position-explanation.tsx"))) {
    const src = stripComments(read(join(compDir, file)));
    if (!/ExternalActorSummary/.test(src)) continue;
    const handRolled = /"Of those/.test(src);
    const routed = /\boperatorLead\(/.test(src);
    if (handRolled || !routed) {
      gaps++;
      const why = handRolled
        ? `hand-rolls "Of those, " rather than calling operatorLead()`
        : `renders the operator bullet without operatorLead()`;
      gapRows.push({ proto, tag: "externalActor/denominator", why });
      console.log(`GAP   ${proto.padEnd(12)} ${"denominator".padEnd(24)} ${why}`);
    } else {
      leadPass++;
    }
  }
}
console.log(`\nOperator-bullet denominators routed through operatorLead(): ${leadPass}`);

// ── Reverse-completeness ────────────────────────────────────────────────────
// Every protocol under components/protocol/ is either checked or explicitly
// recorded as carrying no party seam. A protocol silently falling out of the
// scan is the failure mode that let the risk surfaces go unscanned in
// check:register — so account for the whole roster, out loud.
console.log(`\nNo party seam rendered (not applicable): ${noSeam.join(", ") || "none"}`);
console.log(
  `Roster accounted for: ${protocols.length - noSeam.length} with a party seam + ${noSeam.length} without = ${protocols.length}/${protocols.length}`,
);

console.log(`\n=== SUMMARY ===`);
console.log(
  `${pass} seam(s) explained, ${gaps} gap(s), across ${protocols.length - noSeam.length} protocols that render one`,
);
if (gapRows.length > 0) {
  console.log(`\nThe phase-2 backlog — each renders a party the reader is never told about:`);
  for (const g of gapRows) console.log(`  - ${g.proto} · ${g.tag}: ${g.why}`);
}
process.exit(gaps === 0 ? 0 : 1);
