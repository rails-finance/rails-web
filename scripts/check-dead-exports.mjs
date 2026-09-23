#!/usr/bin/env node
// check:dead — nothing in this repo may export something nobody imports.
// ----------------------------------------------------------------------------
// This gate exists because dead code here does not read as dead. An exported
// symbol with zero call sites sits in the tree looking exactly like live code:
// reviewers and agents describe it as live because they read the branch, not
// the callers. It cost two wrong answers in 48 hours before the gate existed.
//
// ⇒ WHY IT MATTERS MORE HERE THAN IN MOST REPOS. The product claim is that
// every rendered figure traces to a receipt. When it was first run this gate
// found SEVENTY-SEVEN orphaned provenance builders across twenty protocol
// vocabularies — receipt authorship for figures nothing renders. A graveyard
// of those makes any future audit's "the receipt exists" unverifiable, which is
// the exact statement the product sells.
//
// ⚠️ WHAT IT DOES NOT CATCH: a member of an exported type that nothing ever
// constructs. The first of the two incidents was an `InfoDisclosureTab.icon`
// variant with no call site — a union member, not an export — and knip's
// module graph cannot see it. This retires most of the class, not all of it.
//
// Config lives in knip.json. What it deliberately does NOT see:
//   • `tailwindcss` — reached through @tailwindcss/postcss, never imported, so
//     it sits in `ignoreDependencies`. The only exclusion left.
//   • exports used only inside their own file (`ignoreExportsUsedInFile`).
//     Measured before it was left on: turning it off reports ~50 names, and
//     every one is a type an api/chain reader declares and consumes locally —
//     `RawMaplePoolRow`, `CompoundV2MarketState`, the `types/api/trove*` row
//     shapes. Those are named for readability at their point of use, not for a
//     caller elsewhere, so reporting them is noise. A gate that always fails is
//     as useless as one that cannot.
//
// Both of those are the whole exclusion list. An earlier version of this
// comment also claimed `lib/shared/types/protocols/**` was excluded; `3021ebd`
// collapsed those mirrored declarations onto event-shape.ts and dropped the
// exclusion from knip.json without touching this header, so the note outlived
// the thing it described. There is no path-based exclusion now.
//
// The gate is break-tested, not assumed: add an exported function nobody
// imports and `npm run check:dead` must name it and exit 1.

import { spawnSync } from "node:child_process";

const run = spawnSync("npx", ["knip", "--reporter", "compact"], { encoding: "utf8" });
const out = `${run.stdout ?? ""}${run.stderr ?? ""}`.trim();

if (run.status === 0) {
  console.log("No unused exports, files or dependencies.");
  process.exit(0);
}

console.log(out);
console.log(
  "\nFAIL — every symbol above is exported and never imported.\n" +
    "Delete it, or wire it to the surface it was written for. If it is genuinely\n" +
    "reachable another way, say how in knip.json rather than leaving it to read as live.",
);
process.exit(1);
