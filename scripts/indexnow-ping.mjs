#!/usr/bin/env node
// IndexNow ping after a production deploy (rails-ops ui-jobs 513): tells Bing,
// and the engines that share IndexNow, to recrawl the explorer roots and the
// blog posts. Run by hand after a push to main has deployed; nothing pings
// from preview, and the script refuses any host but rails.finance.
//
//   node scripts/indexnow-ping.mjs                 # every explorer root and blog post
//   node scripts/indexnow-ping.mjs --paths /ethereum/liquity-v2,/blog/some-post
//   node scripts/indexnow-ping.mjs --dry-run       # list the URLs, send nothing
//
// The URLs come from the live sitemap: explorer roots are its priority-0.9
// entries (app/sitemap.ts), blog posts its /blog/<slug> entries. The key is
// public/18ad460c79117eb738096ef1efe6ff5e.txt, served at the site's root.

const HOST = "rails.finance";
const KEY = "18ad460c79117eb738096ef1efe6ff5e";
const SITE = `https://${HOST}`;
const ENDPOINT = "https://api.indexnow.org/indexnow";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const pathsArg = args[args.indexOf("--paths") + 1];
const paths =
  args.includes("--paths") && pathsArg
    ? pathsArg
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
    : null;

async function sitemapUrls() {
  const res = await fetch(`${SITE}/sitemap.xml`);
  if (!res.ok) throw new Error(`sitemap: ${res.status}`);
  const xml = await res.text();
  const out = [];
  for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = /<loc>([^<]+)<\/loc>/.exec(m[1])?.[1];
    const priority = /<priority>([^<]+)<\/priority>/.exec(m[1])?.[1];
    if (!loc) continue;
    const path = new URL(loc).pathname;
    if (priority === "0.9" || /^\/blog\/[^/]+$/.test(path)) out.push(loc);
  }
  return out;
}

const urls = paths
  ? paths.map((p) => {
      const u = new URL(p, SITE);
      if (u.host !== HOST) throw new Error(`refusing ${u.href}: only ${HOST} is pinged`);
      return u.href;
    })
  : await sitemapUrls();

if (urls.length === 0) {
  console.error("no URLs to ping");
  process.exit(1);
}
console.log(`${urls.length} URL(s):\n${urls.join("\n")}`);
if (dryRun) process.exit(0);

// The key file must answer before a ping is worth sending.
const keyRes = await fetch(`${SITE}/${KEY}.txt`);
if (!keyRes.ok || (await keyRes.text()).trim() !== KEY) {
  console.error(`the key file ${SITE}/${KEY}.txt does not answer with the key: deploy it first`);
  process.exit(1);
}

const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList: urls }),
});
// 200 and 202 are both accepted; anything else names its reason.
console.log(`IndexNow: ${res.status} ${res.statusText}`);
if (res.status !== 200 && res.status !== 202) {
  console.error(await res.text());
  process.exit(1);
}
