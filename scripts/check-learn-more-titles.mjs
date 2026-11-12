/**
 * Static gate: learn-more modal titles are sentence case at the source
 * (ui-jobs 520, after 510 put page titles in sentence case).
 *
 * A learn-more title is the `title:` of a LearnMoreContent object, so the gate reads every
 * source file that names `LearnMoreContent` and checks each string literal inside a
 * `title:` expression. A word after the first that starts with a capital fails unless it is
 * a proper noun (PROPER below), an acronym or a token symbol (two or more capitals, or a
 * digit in it), or follows a colon.
 *
 * The YAML families (content/<family>/event-prose.yaml) keep theirs under `L5.<key>.title`,
 * read the same way.
 *
 * Add a proper noun to PROPER (one word as its owner writes it) rather than lowercasing it.
 *
 *   node scripts/check-learn-more-titles.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

const ROOTS = ["app", "components", "lib", "content"];
// Multi-word names, removed before the words are checked.
const PHRASES = ["Sky Savings Rate", "Sky Savings", "Savings USDS", "Savings GHO", "Rails Explorers"];
const PROPER = new Set([
  "Aave",
  "Alchemix",
  "Arbitrum",
  "Base",
  "Compound",
  "Dolomite",
  "Equities",
  "Etherscan",
  "Ethereum",
  "Fluid",
  "Frankencoin",
  "Lido",
  "Liquity",
  "LlamaLend",
  "Llamalend",
  "Maker",
  "MakerDAO",
  "Maple",
  "MetaMorpho",
  "Moonwell",
  "Morpho",
  "Blue",
  "Polaris",
  "PWN",
  "Rails",
  "Sky",
  "Spark",
  "SparkLend",
  "Umbrella",
  "Transmuter",
  "Yearn",
  "V1",
  "V2",
  "V3",
  "V4",
  "Trove",
  "Troves",
  "Syrup",
  "Token",
  "Stability",
  "Recovery",
  "Mode",
  "Seamless",
  "Curve",
  "Usual",
  "Fx",
  "f(x)",
  "DeFi",
  "I",
]);

function files(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** The words of a title that are capitalised against sentence case, hyphen parts included. */
function bad(text) {
  let t = text;
  for (const p of PHRASES) t = t.split(p).join("x");
  const words = t
    .replace(/\$\{[^}]*\}/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const hits = [];
  words.forEach((w, i) => {
    const afterColon = i > 0 && words[i - 1].endsWith(":");
    w.split("-").forEach((part, j) => {
      if (i === 0 && j === 0) return;
      const core = part.replace(/^[^A-Za-z]+|[^A-Za-z0-9)]+$/g, "");
      if (!/^[A-Z]/.test(core) || /[A-Z].*[A-Z]|\d/.test(core)) return;
      if (PROPER.has(core) || (afterColon && j === 0)) return;
      hits.push(core);
    });
  });
  return hits;
}

const failures = [];
for (const root of ROOTS) {
  if (!fs.existsSync(root)) continue;
  for (const f of files(root)) {
    const src = fs.readFileSync(f, "utf8");
    if (!src.includes("LearnMoreContent")) continue;
    const re = /\btitle:\s*([\s\S]*?),[ \t]*\n/g;
    let m;
    while ((m = re.exec(src))) {
      const expr = m[1];
      for (const lit of expr.matchAll(/"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
        const s = lit[1] ?? lit[2];
        const hit = bad(s);
        if (hit.length) failures.push(`${f}:${src.slice(0, m.index).split("\n").length}  "${s}"  (${hit.join(", ")})`);
      }
    }
  }
}

// The protocols whose learn-more content lives in YAML: content/<family>/event-prose.yaml, `L5.<key>.title`
// (ui-jobs 534).
for (const family of fs.readdirSync("content")) {
  const f = path.join("content", family, "event-prose.yaml");
  if (!fs.existsSync(f)) continue;
  const src = fs.readFileSync(f, "utf8");
  const l5 = parse(src)?.L5 ?? {};
  for (const [key, entry] of Object.entries(l5)) {
    const s = entry?.title;
    if (typeof s !== "string") continue;
    const hit = bad(s);
    if (!hit.length) continue;
    const at = src.indexOf(`\n  ${key}:\n`);
    const line = at < 0 ? "?" : src.slice(0, at + 1).split("\n").length;
    failures.push(`${f}:${line}  L5.${key}  "${s}"  (${hit.join(", ")})`);
  }
}

if (failures.length) {
  console.error(
    "Learn-more titles must be sentence case (add proper nouns to PROPER in scripts/check-learn-more-titles.mjs):",
  );
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log("learn-more titles: sentence case");
