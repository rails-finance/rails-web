/**
 * Docs links: fetch every official-docs URL Rails prints and report the ones
 * that do not answer 200, and the anchors the page does not carry.
 *
 * Run: `npm run check:docs-links` (add `-- --list` to print the URLs without
 * fetching, `-- --only=<host>` to fetch one host's links).
 *
 * Not part of `npm run check` or `npm test`: a third-party site's uptime must
 * not fail the gate (rails-ops ui-jobs 654, owner's call P1).
 *
 * Which URLs: a URL literal whose host is in content/official-docs.json's
 * `families` (less `notDocumentation`), found in
 *   - app/, lib/ and components/ (.ts, .tsx): string literals, and template
 *     literals that start from a constant of the same file (`${DOCS}/x`, with
 *     `const DOCS = "https://…"`); a template that does not resolve is counted
 *     and listed, not fetched;
 *   - content/ (.yaml, .json): every URL, the event-prose `doc_urls`, modal
 *     `links` and concept `sources` among them.
 *
 * Fetching: one plain GET per URL (the fragment dropped), one at a time, a
 * generic user agent, one retry on a network error or a 5xx. An anchor counts
 * as present when the page's HTML has `id="<anchor>"` or `name="<anchor>"`.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const LIST = args.includes("--list");
const ONLY = args.find((a) => a.startsWith("--only="))?.slice(7) ?? null;
const UA = "Mozilla/5.0 (compatible; docs-link-check/1.0)";

const docs = JSON.parse(readFileSync(join(ROOT, "content/official-docs.json"), "utf8"));
const hosts = new Set(Object.values(docs.families).flat());
for (const h of docs.notDocumentation) hosts.delete(h);
const familiesOf = (host) =>
  Object.entries(docs.families)
    .filter(([, hs]) => hs.includes(host))
    .map(([f]) => f);

function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, out);
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

const URL_RE = /https?:\/\/[^\s"'`<>)\]},\\]+/g;
const clean = (u) => u.replace(/[.,;:]+$/, "");

/** url -> Set of "file:line" */
const found = new Map();
const unresolved = [];
const add = (url, where) => {
  let u;
  try {
    u = new URL(clean(url));
  } catch {
    return;
  }
  if (!hosts.has(u.host)) return;
  const key = u.href;
  if (!found.has(key)) found.set(key, new Set());
  found.get(key).add(where);
};

// Code: literals, and templates over same-file constants.
for (const f of walk(join(ROOT, "app"), [".ts", ".tsx"])
  .concat(walk(join(ROOT, "lib"), [".ts", ".tsx"]))
  .concat(walk(join(ROOT, "components"), [".ts", ".tsx"]))) {
  const rel = relative(ROOT, f);
  const src = readFileSync(f, "utf8");
  const consts = {};
  // A constant used only as a template's base is not printed: its own line is skipped.
  const baseOnly = new Set();
  for (const m of src.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*["'`](https?:\/\/[^"'`$]+)["'`]/g)) {
    consts[m[1]] = m[2];
    const uses = src.match(new RegExp(`\\b${m[1].replace(/\$/g, "\\$")}\\b`, "g")).length;
    const inTemplates = src.split("${" + m[1] + "}").length - 1;
    if (inTemplates > 0 && uses === inTemplates + 1) baseOnly.add(m[1]);
  }
  const lines = src.split("\n");
  for (const [i, line] of lines.entries()) {
    const where = `${rel}:${i + 1}`;
    const def = line.match(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/);
    if (!(def && baseOnly.has(def[1]))) for (const m of line.matchAll(URL_RE)) add(m[0], where);
    for (const m of line.matchAll(/`\$\{([A-Za-z_$][\w$]*)\}([^`]*)`/g)) {
      const base = consts[m[1]];
      if (!base) continue;
      const rest = m[2];
      if (rest.includes("${")) {
        if (hosts.has(new URL(base).host)) unresolved.push({ where, text: m[0] });
        continue;
      }
      add(base + rest, where);
    }
  }
}

// Content: every URL.
for (const f of walk(join(ROOT, "content"), [".yaml", ".yml", ".json"])) {
  const rel = relative(ROOT, f);
  if (rel === "content/official-docs.json") continue;
  for (const [i, line] of readFileSync(f, "utf8").split("\n").entries())
    for (const m of line.matchAll(URL_RE)) add(m[0], `${rel}:${i + 1}`);
}

let urls = [...found.keys()].sort();
if (ONLY) urls = urls.filter((u) => new URL(u).host === ONLY);

if (LIST) {
  for (const u of urls) console.log(u);
  console.log(`\n${urls.length} URLs; ${unresolved.length} templates not resolved.`);
  process.exit(0);
}

async function get(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow" });
      if (res.status >= 500 && attempt === 0) continue;
      const body = res.ok ? await res.text() : "";
      return { status: res.status, body, final: res.url };
    } catch (e) {
      if (attempt === 1) return { status: 0, body: "", final: url, error: String(e.cause?.code ?? e.message) };
    }
  }
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pages = new Map();
const bad = [];
let anchorsChecked = 0;
for (const u of urls) {
  const url = new URL(u);
  const anchor = url.hash ? decodeURIComponent(url.hash.slice(1)) : null;
  url.hash = "";
  const page = url.href;
  if (!pages.has(page)) pages.set(page, await get(page));
  const r = pages.get(page);
  const where = [...found.get(u)];
  if (r.status !== 200) {
    bad.push({ url: u, problem: r.status ? `HTTP ${r.status}` : `no answer (${r.error})`, where });
    continue;
  }
  if (anchor) {
    anchorsChecked++;
    if (!new RegExp(`(?:id|name)=["']${esc(anchor)}["']`).test(r.body))
      bad.push({ url: u, problem: `anchor #${anchor} not in the page`, where });
  }
}

const byFamily = {};
for (const b of bad) {
  const fam = familiesOf(new URL(b.url).host).join("/");
  (byFamily[fam] ??= []).push(b);
}
for (const [fam, rows] of Object.entries(byFamily).sort()) {
  console.log(`\n${fam}`);
  for (const b of rows)
    console.log(
      `  ${b.problem}  ${b.url}\n      ${b.where.slice(0, 3).join(", ")}${b.where.length > 3 ? ` (+${b.where.length - 3})` : ""}`,
    );
}
if (unresolved.length) {
  console.log(`\nTemplates not resolved (not fetched):`);
  for (const u of unresolved) console.log(`  ${u.where}  ${u.text}`);
}
console.log(
  `\n${urls.length} URLs on ${pages.size} pages (${new Set(urls.map((u) => new URL(u).host)).size} hosts), ${anchorsChecked} anchors: ${bad.length} failing.`,
);
process.exit(bad.length ? 1 : 0);
