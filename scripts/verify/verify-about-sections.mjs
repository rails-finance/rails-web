// The About pages that follow their menu (rails-ops ui-jobs 790): the intro,
// then one section per menu entry in the menu's order, the glossary in a right
// column from sm up and after the documentation line below sm.
// Run with the dev server on BASE (default :3000).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";

/** Every About page drawn by ProtocolInfoPage: each `<chain>/<slug>/info` route
 *  that is not a redirect and not the exempt Polaris shell. `PAGES=` narrows it. */
const APP = new URL("../../app/(app)/", import.meta.url);
const PAGES = process.env.PAGES
  ? process.env.PAGES.split(",")
  : readdirSync(APP).flatMap((chain) =>
      existsSync(new URL(`${chain}/`, APP)) && !chain.includes(".")
        ? readdirSync(new URL(`${chain}/`, APP)).flatMap((slug) => {
            const f = new URL(`${chain}/${slug}/info/page.tsx`, APP);
            if (!existsSync(f)) return [];
            const src = readFileSync(f, "utf8");
            return /redirect|ProtocolInfoShell/i.test(src) ? [] : [`/${chain}/${slug}/info`];
          })
        : [],
    );
/** Menu entries with no About section by design: the front door and About. */
const NOT_SECTIONS = new Set(["Overview", "About"]);

const fails = [];
const check = (cond, msg) => {
  if (cond) console.log("  ok:", msg);
  else (fails.push(msg), console.log("  FAIL:", msg));
  return cond;
};

const browser = await chromium.launch();
for (const [width, tag] of [
  [1280, "desktop"],
  [390, "phone"],
]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  for (const path of PAGES) {
    // A 500 is a failure here, not a timeout further on.
    const res = await page.goto(BASE + path, { waitUntil: "networkidle" }).catch((e) => e);
    const status = res instanceof Error ? res.message.split("\n")[0] : res?.status();
    if (!check(typeof status === "number" && status < 400, `${tag} ${path}: loads (${status})`)) continue;
    const got = await page.evaluate(() => {
      const menu = [
        ...document.querySelectorAll("[data-sections-menu] [role=menuitem]:not([data-sections-chain])"),
      ].map((a) => a.textContent.trim());
      const sections = [...document.querySelectorAll("[data-info-section]")].map((s) => ({
        key: s.getAttribute("data-info-section"),
        heading: s.querySelector("h2")?.textContent.trim() ?? "",
      }));
      const rect = (sel) => document.querySelector(sel)?.getBoundingClientRect().toJSON() ?? null;
      return {
        menu,
        sections,
        intro: rect('[data-info-section="intro"]'),
        glossary: rect("[data-info-glossary]"),
        docs: rect('[data-anatomy="I7"]'),
        pointer: document.querySelectorAll('[data-anatomy="I6"]').length,
      };
    });
    const menu = got.menu.filter((m) => !NOT_SECTIONS.has(m));
    const headings = got.sections.filter((s) => s.key !== "intro").map((s) => s.heading);
    check(got.sections[0]?.key === "intro", `${tag} ${path}: opens with the intro`);
    check(got.pointer === 1, `${tag} ${path}: draws the pointer line (I6) once (got ${got.pointer})`);
    // Every section is a menu entry, in the menu's order; an entry with no
    // copy is left off, and the desktop pass names it.
    const inMenuOrder = headings.every((h, i) => menu.indexOf(h) > (i ? menu.indexOf(headings[i - 1]) : -1));
    check(inMenuOrder, `${tag} ${path}: sections follow the menu (${headings.join(", ")} / menu ${menu.join(", ")})`);
    if (tag === "desktop") {
      const empty = menu.filter((m) => !headings.includes(m));
      if (empty.length) console.log(`  note: ${path} has no copy for ${empty.join(", ")}`);
    }
    if (!got.glossary || !got.intro || !got.docs) {
      check(false, `${tag} ${path}: glossary, intro and documentation line drawn`);
      continue;
    }
    if (width >= 640)
      check(
        got.glossary.left >= got.intro.right && got.glossary.top < got.intro.bottom,
        `${tag} ${path}: glossary in the right column`,
      );
    else check(got.glossary.top >= got.docs.bottom, `${tag} ${path}: glossary after the documentation line`);
  }
  await page.close();
}
await browser.close();
if (fails.length) {
  console.error(`\n${fails.length} FAILED`);
  process.exit(1);
}
console.log("\nALL CHECKS PASSED");
