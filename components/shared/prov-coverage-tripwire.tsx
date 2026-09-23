"use client";

// Dev-mode provenance-coverage tripwire.
// ----------------------------------------------------------------------------
// The receipts pane only knows about values wrapped in <Prov> — a stat added to
// a receipted surface without one renders normally and silently has no receipt.
// This scanner makes that gap loud in dev: <ProvReceiptsScope> sandwiches its
// children between two hidden bookend anchors, and after render (plus on every
// DOM mutation, debounced) the subtree between them is swept for value-shaped
// text that no <Prov> covers. Findings get a red dashed outline
// (`data-prov-uncovered` → globals.css) and one console.warn per new value.
//
// What counts as a value: an element whose ENTIRE text reads as a stat figure
// ("0.136", "$8,577", "438%", "798.84 frxUSD"). Numbers embedded in prose
// (an explainer's "clamped at 2,000 BOLD") sit in a sentence-shaped parent and
// don't trip it. Chrome that legitimately shows an untraced figure (event
// numbers, timestamps, gas footers, pagination) opts out with a
// `data-prov-exempt` stamp on the enclosing element.
//
// Production builds render none of this — the scope mounts children directly
// and <Prov> skips the coverage stamp, so the shipped DOM is unchanged.

import { useEffect, useRef, type ReactNode } from "react";

/** An element is "a value" when its whole collapsed text is one stat-shaped
 *  token: optional approx/sign prefix, a formatted number, optional %/K/M/B,
 *  optional trailing ticker word. Anything longer reads as prose and is the
 *  surrounding component's business. */
const STAT_RE = /^[~≈<>±+\-−]?\$?\d[\d,]*(?:\.\d+)?\s?[KMB%]?(?:\s[A-Za-z$][\w.$/-]{0,11})?$/;

/** Subtrees the sweep never enters: a <Prov>-covered value, receipts-pane
 *  chrome, an explicit exemption, capture decoration, charts (axis ticks are
 *  visualization, not stats), and the bookends themselves. */
const SKIP = "[data-prov-covered],[data-prov-chrome],[data-prov-exempt],[data-prov-hidden],svg,[data-prov-tripwire]";

/** Evidence a candidate's figure is accounted for: only an actual trace, pane
 *  chrome, or an explicit exemption. Deliberately narrower than SKIP —
 *  data-prov-hidden marks capture DECORATION (a token glyph, an open tooltip),
 *  and AssetAmount renders one inside every headline, so treating it as
 *  coverage made the sweep blind to the app's standard value component: an
 *  unwrapped AssetAmount could never trip the wire. */
const COVERED = "[data-prov-covered],[data-prov-chrome],[data-prov-exempt]";

const collapse = (s: string | null): string => s?.replace(/\s+/g, " ").trim() ?? "";

/** The outermost element between the bookends whose whole text is one stat
 *  token and which neither sits under nor contains a covered/exempt node. */
function collectFindings(start: Element, end: Element): HTMLElement[] {
  const findings: HTMLElement[] = [];
  for (let sib = start.nextElementSibling; sib && sib !== end; sib = sib.nextElementSibling) {
    const walker = document.createTreeWalker(sib, NodeFilter.SHOW_ELEMENT);
    for (let node: Node | null = sib; node; node = walker.nextNode()) {
      const el = node as HTMLElement;
      if (el.closest(SKIP)) continue;
      if (!STAT_RE.test(collapse(el.textContent))) continue;
      // Outermost-only: when the parent is the same lone token ("<div><span>
      // 0.136</span></div>"), the parent already carries the finding.
      const p = el.parentElement;
      if (p && STAT_RE.test(collapse(p.textContent))) continue;
      // A covered/exempt node inside means the figure itself is accounted for
      // (a hidden glyph or an svg inside is decoration, not coverage).
      if (el.querySelector(COVERED)) continue;
      findings.push(el);
    }
  }
  return findings;
}

/** Dev bookends around a receipts scope's children. Rendered by
 *  <ProvReceiptsScope> only in dev — never call this from anywhere else. */
export function ProvCoverageBounds({ children }: { children: ReactNode }) {
  const startRef = useRef<HTMLElement>(null);
  const endRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const start = startRef.current;
    const end = endRef.current;
    const root = start?.parentElement;
    if (!start || !end || !root) return;

    const stamped = new Set<HTMLElement>();
    const warned = new Set<string>(); // one warn per distinct value text per scope

    const scan = () => {
      if (!start.isConnected || !end.isConnected) return;
      const findings = collectFindings(start, end);
      const current = new Set(findings);
      for (const el of stamped) {
        if (!current.has(el)) {
          el.removeAttribute("data-prov-uncovered");
          stamped.delete(el);
        }
      }
      const fresh: HTMLElement[] = [];
      for (const el of findings) {
        if (!stamped.has(el)) {
          el.setAttribute("data-prov-uncovered", "");
          stamped.add(el);
        }
        const text = collapse(el.textContent);
        if (!warned.has(text)) {
          warned.add(text);
          fresh.push(el);
        }
      }
      if (fresh.length) {
        console.warn(
          `[prov-coverage] ${fresh.length} value(s) in a receipts scope with no <Prov> — ` +
            `wrap each in <Prov info={…}> so it joins the receipts pane, or stamp ` +
            `data-prov-exempt on chrome that legitimately shows an untraced figure:`,
          fresh.map((el) => `"${collapse(el.textContent)}"`).join(", "),
          fresh,
        );
      }
    };

    // First sweep after the card settles; the observer catches everything that
    // mounts later (lazy detail sections, expanded panes). Attribute mutations
    // are NOT observed, so our own stamping can't retrigger the sweep.
    let timer = window.setTimeout(scan, 400);
    const observer = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(scan, 400);
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      for (const el of stamped) el.removeAttribute("data-prov-uncovered");
    };
  }, []);

  return (
    <>
      <i hidden ref={startRef} data-prov-tripwire="" />
      {children}
      <i hidden ref={endRef} data-prov-tripwire="" />
    </>
  );
}
