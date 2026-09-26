"use client";

// Provenance — the page-level inspector over per-surface receipt registries.
// ----------------------------------------------------------------------------
// A surface (event card, position card, economics tower/panel, market row)
// wraps itself in a <ProvReceiptsScope>; every `<Prov info={…}>` value inside
// registers into the scope's registry. The page-level inspector (the dock's
// target tool, prov-inspector.tsx) is the one reader: armed, every scoped
// value is a click target, and a pick pins that figure's receipt into a
// popover at the value. Outside a scope `<Prov>` renders children verbatim
// (zero DOM). The per-card Provenance heading-button + receipts pane — this
// file's earlier model — was retired 2026-07-22 in the inspector's favour.
//
// Provenance is STRUCTURED: a kind (chain / derived / off-chain), a summary, an
// optional smart-CONTRACT slot (copyable block-explorer link), the event/method
// `via`, a `formula`, and `inputs` — what a derived value is derived FROM, each
// input tagged by its own kind and copyable.

import { useChainId } from "@/lib/shared/chain-context";
import { explorerUrl } from "@/lib/shared/chains";
import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";
import { Box, Check, CircleHelp, Copy, ExternalLink, TriangleAlert, X } from "lucide-react";
import { TokenChipIcon } from "./token-chip-icon";
import { ProvCoverageBounds } from "./prov-coverage-tripwire";
import { formatExact } from "@/lib/utils/format";

// Dev gates the coverage tripwire (scope bookends + the <Prov> coverage stamp);
// Next inlines NODE_ENV, so the prod bundle carries neither.
const DEV = process.env.NODE_ENV !== "production";

export type ProvKind = "chain" | "chain-derived" | "derived" | "offchain";

/** The five DISTANCE classes the spine renders — a display refinement layered
 *  OVER the 4-kind gate, not a replacement for it (chain-truth-charter). Ordered
 *  by distance from chain-state: emitted (a field in the event's own log) ·
 *  state (a contract slot read at a block) · oracle (an on-chain price feed) —
 *  all three on-chain and third-party verifiable — then indexed (materialized by
 *  our backend, no third-party proof) · offchain (no on-chain anchor at all). */
export type ProvClass = "emitted" | "state" | "oracle" | "indexed" | "offchain";

/** How a user confirms a value WITHOUT trusting Rails — a link OUT to a neutral
 *  third party, never a live read on our side (zero-RPC by construction).
 *  `etherscan` carries an href; `recompute` / `rollup` / `none` are muted notes
 *  (recompute it yourself from the leaves; it rolls up its inputs; nothing to
 *  verify). Absent → the spine derives a sensible default from the class. */
export interface ProvVerify {
  kind: "etherscan" | "recompute" | "rollup" | "none";
  href?: string;
  text: string;
}

export interface ProvInput {
  label: string;
  value?: string;
  kind: ProvKind;
  note?: string;
  /** Precise distance class for the spine; falls back to a map from `kind`. */
  pclass?: ProvClass;
  /** Third-party proof for this leaf (defaults from its class). */
  verify?: ProvVerify;
  /** The contract this leaf was read from — surfaces in the leaf's detail rows. */
  contract?: { name: string; address?: string };
}
export interface Provenance {
  kind: ProvKind;
  summary: string;
  contract?: { name: string; address?: string };
  via?: string;
  formula?: string;
  inputs?: ProvInput[];
  /** Precise distance class for the displayed value; falls back to `kind`. */
  pclass?: ProvClass;
  /** Third-party proof for the displayed value (defaults from its class). */
  verify?: ProvVerify;
  /** The source block/tx this value was recorded at — the spine's left bookend.
   *  When absent, the spine infers it from any `block` / `tx` labelled inputs. */
  source?: { block?: number | string; txHash?: string; timestamp?: string; network?: string };
  /** The log's raw integer and how it becomes the shown figure — one plain
   *  sentence under the summary. Built only from a raw the backend delivered;
   *  absent raw, no sentence (never reconstructed from the rounded float). */
  scaling?: ProvScaling;
}

export interface ProvScaling {
  /** The untouched integer, as the backend or the chain read serialized it. */
  raw: string;
  /** Where the integer came from: an event log's field (the default), or a
   *  contract call's return value. The sentence names it, and a log sentence
   *  is false of a call (TO-DO-ui-jobs §34). */
  from?: "log" | "call";
  /** The power of ten the raw is divided by (the via line's `÷10^n`). */
  places: number;
  /** Why that power — a clause the sentence continues with ", so dividing…". */
  why: string;
  /** Appended to the result (e.g. "%"). */
  unit?: string;
}

/** Move the decimal point of an integer string `places` to the left — exact
 *  string arithmetic, so the result carries every digit the raw has. */
export function shiftDecimal(raw: string, places: number): string {
  const neg = raw.startsWith("-");
  const digits = (neg ? raw.slice(1) : raw).replace(/^0+/, "") || "0";
  const padded = digits.padStart(places + 1, "0");
  const int = padded.slice(0, padded.length - places);
  const frac = padded.slice(padded.length - places).replace(/0+$/, "");
  return `${neg ? "-" : ""}${int}${frac ? `.${frac}` : ""}`;
}

/** Block/tx coords for the spine's left bookend. An event card wraps its body in
 *  a `<ProvSource>` so every `<Prov>` inside inherits the tx it was recorded at;
 *  values read at head (no tx) leave it undefined and the bookend reads "latest
 *  block". Kept separate from `Provenance` so one context serves a whole card. */
export interface ProvSource {
  block?: number | string;
  txHash?: string;
  timestamp?: string;
  network?: string;
}
const ProvSourceCtx = createContext<ProvSource | null>(null);

/** Wrap an event card's body so the values inside know the tx/block they were
 *  recorded at — the spine's block bookend and the absorbed card footnote. */
export function ProvSource({ source, children }: { source: ProvSource; children: ReactNode }) {
  return <ProvSourceCtx.Provider value={source}>{children}</ProvSourceCtx.Provider>;
}

// ── The receipts scope ───────────────────────────────────────────────────────
// A card wraps its content in a <ProvReceiptsScope>, and every <Prov> inside
// reports into the card's ReceiptRegistry — the inspector's per-surface roster.
// The connection runs receipt → value: while a receipt is pinned, every
// rendered instance of that figure on the card holds the teal locator pill.
// The values are inert content until the inspector arms. Every traced surface
// owns a scope (event cards, position cards, the towers and economics panels,
// market rows); a <Prov> outside any scope renders its children verbatim.

export interface ProvReceiptEntry {
  id: string;
  info: Provenance;
  value: string;
  display: string;
  symbol: string | null;
  source: ProvSource | null;
  /** The rendered element on the card — the locator pulse's target. Refreshed
   *  every render outside the signature no-op (a remount must not strand it). */
  el: HTMLElement | null;
  /** An echo is another rendering of a figure whose receipt already exists
   *  (same label|value|symbol key) — a locator-pulse target only. It never
   *  forms a receipt row of its own; with no matching primary receipt it is
   *  simply inert. Used where a card repeats a figure through a different
   *  component (the spine flanking value, the detail's delta toggle). */
  echo?: boolean;
  /** Mount order — the list reads top-to-bottom like the card does. */
  order: number;
}

const EMPTY_ENTRIES: ProvReceiptEntry[] = [];

/** Content signature — registration re-runs on every render, so re-registering
 *  an unchanged value must be a silent no-op (no emit, no re-render loop). */
const entrySig = (e: Omit<ProvReceiptEntry, "order">) =>
  [
    e.value,
    e.display,
    e.symbol ?? "",
    e.echo ? "echo" : "",
    e.info.summary,
    e.info.formula ?? "",
    e.info.via ?? "",
    (e.info.inputs ?? []).map((i) => `${i.label}:${i.value ?? ""}`).join("|"),
  ].join("§");

/** Per-card store of the traced values mounted inside a scope. A tiny external
 *  store (not React state) so <Prov> can register from an every-render effect
 *  without cascading re-renders — only the inspector's popover subscribes. */
export class ReceiptRegistry {
  private map = new Map<string, ProvReceiptEntry & { sig: string }>();
  private order = 0;
  private listeners = new Set<() => void>();
  private snapshot: ProvReceiptEntry[] = EMPTY_ENTRIES;

  register = (e: Omit<ProvReceiptEntry, "order">) => {
    const sig = entrySig(e);
    const prev = this.map.get(e.id);
    if (prev && prev.sig === sig) {
      // Same content, possibly a remounted node — keep the pulse target live
      // without emitting (an emit here would re-render subscribers every render).
      prev.el = e.el;
      return;
    }
    this.map.set(e.id, { ...e, order: prev?.order ?? this.order++, sig });
    this.emit();
  };
  unregister = (id: string) => {
    if (!this.map.delete(id)) return;
    this.emit();
  };
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getEntries = () => this.snapshot;
  private emit() {
    this.snapshot = [...this.map.values()].sort((a, b) => a.order - b.order);
    this.listeners.forEach((fn) => fn());
  }
}

interface ReceiptsScope {
  registry: ReceiptRegistry;
}
const ProvReceiptsScopeCtx = createContext<ReceiptsScope | null>(null);

// ⇒ THE SILENT NO-OP THIS GUARDS. A <Prov> outside a receipts scope renders its
// children VERBATIM and registers nothing: no row in the inspector, no locator
// target, no receipt — while the markup reads as fully wired at every call
// site. It cost a whole risk surface once (LlamaLend's health, band count, both
// band edges and the oracle price all traced nothing, because the component
// mounted as a sibling of the card rather than inside it). Nothing failed;
// there was simply no row.
//
// So in dev an unscoped <Prov> says so, once per receipt label. There are two
// ways to say "deliberately unscoped", because the decision is made at two
// different levels:
//
//   • <ProvUnscoped> around a subtree — for a RENDER SITE that is scope-free by
//     design. The listing render of a position card is the case: the same card
//     component draws both a listing row (no scope) and a detail card (its own
//     scope), so the figures inside cannot know which they are in. The shell
//     knows, and marks it.
//   • the `unscoped` prop on one <Prov> — for a single figure deliberately
//     outside, where a whole subtree marker would over-reach.
//
// Neither suppresses anything at runtime: they are assertions that the author
// considered it, and they read as such at the call site.
const ProvUnscopedCtx = createContext(false);

/** Marks a subtree as deliberately outside any receipts scope, so the dev
 *  unscoped-<Prov> warning stays quiet for it. Render-site level: the caller
 *  is asserting it knows these figures trace nothing here. */
export function ProvUnscoped({ children }: { children: ReactNode }) {
  return <ProvUnscopedCtx.Provider value={true}>{children}</ProvUnscopedCtx.Provider>;
}

const warnedUnscoped = new Set<string>();

// ── The page-level inspector ─────────────────────────────────────────────────
// The "target tool": one armed mode for the WHOLE page (vs the per-card panel
// picker above). While armed, every scoped <Prov> on the page is a click
// target, and a click pins that figure's receipt into a popover anchored AT
// the value (prov-inspector.tsx renders it) — the answer lands where the
// question was asked, no panel round-trip. Sticky by design: a pick keeps the
// mode armed so the reader can walk value to value; Escape closes the popover
// first, then the mode. A module singleton, not a context — one page, one
// tool; the dock toggle and the layer both talk to this store.

export interface ProvInspectorPin {
  /** The pinned figure's identity (entryKey) — the popover keys a remount on it. */
  key: string;
  /** The primary (non-echo) receipt row entry for the figure. */
  entry: ProvReceiptEntry;
  /** The scope registry the figure lives in — the locator pulse's roster. */
  registry: ReceiptRegistry;
  /** The clicked instance — the popover's anchor. */
  el: HTMLElement;
  /** Bumped per pick, so re-picking the same figure re-anchors the popover. */
  tick: number;
}

export class ProvInspectorStore {
  private armed = false;
  private pinned: ProvInspectorPin | null = null;
  private tick = 0;
  private listeners = new Set<() => void>();
  setArmed = (on: boolean) => {
    if (this.armed === on) return;
    this.armed = on;
    if (!on) this.pinned = null;
    this.emit();
  };
  pin = (entry: ProvReceiptEntry, registry: ReceiptRegistry, el: HTMLElement) => {
    this.pinned = { key: entryKey(entry), entry, registry, el, tick: ++this.tick };
    this.emit();
  };
  unpin = () => {
    if (!this.pinned) return;
    this.pinned = null;
    this.emit();
  };
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getArmed = () => this.armed;
  getPin = () => this.pinned;
  private emit() {
    this.listeners.forEach((fn) => fn());
  }
}

export const provInspector = new ProvInspectorStore();

/** Wrap a card's content so every <Prov> inside reports into its receipts
 *  panel. The shell owns the registry. In dev the children mount between
 *  coverage-tripwire bookends — value-shaped text no <Prov> covers gets a red
 *  outline + console.warn (prov-coverage-tripwire.tsx); prod mounts children
 *  directly. `bounds={false}` skips the dev bookends outright — for a scope
 *  nested inside a table row, where the `<i hidden>` bookends would land
 *  between `<tbody>` and `<tr>` and get reparented by the HTML table parser
 *  (a hydration mismatch). The outer surface scope still sweeps that subtree,
 *  so coverage is unaffected; default-true keeps every existing caller
 *  byte-identical. */
export function ProvReceiptsScope({
  registry,
  children,
  bounds = true,
}: {
  registry: ReceiptRegistry;
  children: ReactNode;
  bounds?: boolean;
}) {
  const value = useMemo(() => ({ registry }), [registry]);
  return (
    <ProvReceiptsScopeCtx.Provider value={value}>
      {DEV && bounds ? <ProvCoverageBounds>{children}</ProvCoverageBounds> : children}
    </ProvReceiptsScopeCtx.Provider>
  );
}

/** Lazily create a surface's ReceiptRegistry — stable across renders. The
 *  shell that owns the scope owns the registry. */
export function useReceiptRegistry(): ReceiptRegistry {
  const ref = useRef<ReceiptRegistry | null>(null);
  if (ref.current == null) ref.current = new ReceiptRegistry();
  return ref.current;
}

const shortHex = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

/** Formula words that aren't operands — never flagged by the receipt's
 *  untraced-input self-audit. */
const FORMULA_STOPWORDS = new Set([
  "rounded",
  "rounding",
  "up",
  "down",
  "the",
  "of",
  "at",
  "to",
  "per",
  "and",
  "or",
  "wei",
  "abs",
  "min",
  "max",
  "sum",
]);

// The dock is reachable (click-select, not hover) so it can hold live controls.
function CopyBtn({ text, title = "Copy" }: { text: string; title?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={title}
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="inline-flex items-center text-rb-500 hover:text-foreground transition-colors"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

// ── The receipt ──────────────────────────────────────────────────────────────
// A clicked value renders as ONE pane — no steps, no selection. A derivation is
// an expression, not a sequence, so the layout is the equation itself: the
// displayed value on the left (weakest-link class chip + summary), and on the
// right the formula, one row per operand leaf (each dotted with its own
// distance class), then the source coordinates the flow was recorded at. The
// five distance classes layer over the shipped 4-kind gate.

export const CLASS_META: Record<ProvClass, string> = {
  emitted: "Emitted",
  state: "State",
  oracle: "Oracle",
  indexed: "Indexed",
  offchain: "Off-chain",
};
export const CLASS_CSS: Record<ProvClass, string> = {
  emitted: "prov-cls-emitted",
  state: "prov-cls-state",
  oracle: "prov-cls-oracle",
  indexed: "prov-cls-indexed",
  offchain: "prov-cls-offchain",
};

/** Map a 4-kind gate value to a distance class when the vocabulary hasn't named
 *  one precisely. Best-effort — a vocabulary overrides it with `pclass` (e.g. a
 *  slot read is `chain` but `state`, an oracle price is `chain-derived` but the
 *  `oracle` class). The gate itself is unchanged; this only drives the display. */
export function resolveClass(kind: ProvKind, pclass?: ProvClass): ProvClass {
  if (pclass) return pclass;
  switch (kind) {
    case "chain":
      return "emitted";
    case "chain-derived":
      return "oracle";
    case "derived":
      return "indexed";
    case "offchain":
      return "offchain";
  }
}

/** The value's display class + computed flag — shared by the receipt pane and
 *  the receipts-panel rows. A vocabulary-stated `pclass` wins. Otherwise a
 *  COMPUTED value (formula over inputs) inherits the furthest class among its
 *  actual inputs — the weakest link — so a ratio whose price input is an oracle
 *  read doesn't badge as if it WERE an oracle read. Plain reads fall back to
 *  the kind map. */
export const CLASS_RANK: Record<ProvClass, number> = { emitted: 0, state: 1, oracle: 2, indexed: 3, offchain: 4 };
export function classifyValue(info: Provenance): { vcls: ProvClass; isComputed: boolean; leaves: ProvInput[] } {
  const leaves = (info.inputs ?? []).filter((i) => !["block", "tx"].includes(i.label.toLowerCase()));
  const isComputed = Boolean(info.formula && leaves.length > 0);
  const weakest = leaves.reduce<ProvClass | null>((acc, l) => {
    const c = resolveClass(l.kind, l.pclass);
    return !acc || CLASS_RANK[c] > CLASS_RANK[acc] ? c : acc;
  }, null);
  const vcls = info.pclass ?? (isComputed && weakest ? weakest : resolveClass(info.kind));
  return { vcls, isComputed, leaves };
}

// No per-class default proof line: the generic how-to-verify prose lives in the
// distance-ladder modal (the "?" beside the class chip), so the receipt only
// carries a verify row when the vocabulary states one (or a tx link exists).

function VerifyRow({ v }: { v: ProvVerify }) {
  if (v.kind === "etherscan" && v.href)
    return (
      <a className="prov-verify prov-verify-link" href={v.href} target="_blank" rel="noopener noreferrer">
        <ExternalLink aria-hidden />
        <span>{v.text}</span>
      </a>
    );
  return <span className="prov-verify prov-verify-muted">{v.text}</span>;
}

function ContractLink({ c }: { c: { name: string; address?: string } }) {
  const chainId = useChainId();
  if (!c.address) return <span>{c.name}</span>;
  return (
    <a href={explorerUrl(chainId, "address", c.address)} target="_blank" rel="noopener noreferrer">
      {c.name} {shortHex(c.address)}
    </a>
  );
}

function LadderRung({ cls, name, children }: { cls: ProvClass; name: string; children: ReactNode }) {
  return (
    <div className="prov-rung">
      <span className={`prov-chip ${CLASS_CSS[cls]}`}>
        <span className="prov-chip-dot" />
        {name}
      </span>
      <span className="prov-desc">{children}</span>
    </div>
  );
}

/** Shared centered-modal shell (the learn-more chrome): portal to document.body,
 *  blurred scrim, body scroll lock, Escape to close. Portaling out of the dock
 *  deliberately puts the content back on the NORMAL theme surface. SSR guard:
 *  document is undefined on the server. Escape is heard on `window` in the
 *  capture phase and stopped there, so it closes the modal and never reaches
 *  the inspector's own Escape rungs (a modal opened from the popover must not
 *  close the popover with it). */
function ProvModal({ ariaLabel, onClose, children }: { ariaLabel: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      data-prov-chrome=""
    >
      <div
        className="fixed inset-0 backdrop-blur-sm pointer-events-none"
        style={{ background: "var(--backdrop-bg)" }}
      />
      <div className="relative min-h-full flex items-start sm:items-center justify-center p-4">
        <div
          className="relative rounded-2xl max-w-lg w-full my-8 p-6 shadow-xl"
          style={{ background: "var(--surface-overlay)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={onClose} className="absolute top-4 right-4 btn-ghost cursor-pointer" aria-label="Close">
            <X size={20} aria-hidden />
          </button>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Names the ACTUAL adjustment the compact form made to this value — the
 *  direction and size of the rounding — not just the general rule. */
function NotationModal({ display, exact, onClose }: { display: string; exact: string; onClose: () => void }) {
  // Recover both figures. `exact` is a grouped decimal ("43,041.84"); `display`
  // is the compact form ("43K"), expanded via its K/M/B multiplier.
  const exactN = parseFloat(exact.replace(/−/g, "-").replace(/,/g, ""));
  const m = display
    .replace(/−/g, "-")
    .replace(/,/g, "")
    .match(/^([+-]?[0-9]*\.?[0-9]+)\s*([KMB])?$/i);
  const mult = m?.[2] ? ({ K: 1e3, M: 1e6, B: 1e9 }[m[2].toUpperCase()] ?? 1) : 1;
  const displayN = m ? parseFloat(m[1]) * mult : null;

  let adjustment: ReactNode = null;
  if (displayN != null && Number.isFinite(exactN) && exactN !== 0) {
    // Compare magnitudes: "down" = the compact form understates the figure.
    // toPrecision(12) clears float noise from the subtraction (43,041.84 −
    // 43,000 must read 41.84, not 41.84000000000015).
    const diff = parseFloat((Math.abs(exactN) - Math.abs(displayN)).toPrecision(12));
    if (diff === 0) {
      adjustment = <>No adjustment — the compact form is this value exactly.</>;
    } else {
      const pct = (Math.abs(diff) / Math.abs(exactN)) * 100;
      adjustment = (
        <>
          Rounded <b>{diff > 0 ? "down" : "up"}</b>: the compact form {diff > 0 ? "understates" : "overstates"} the
          exact figure by <b>{formatExact(Math.abs(diff))}</b> ({pct < 0.01 ? "< 0.01" : pct.toFixed(2)}%).
        </>
      );
    }
  }

  return (
    <ProvModal ariaLabel="Compact notation" onClose={onClose}>
      <h2 className="text-lg font-bold mb-4">Compact notation</h2>
      <div className="space-y-3 text-sm leading-relaxed">
        <p className="font-mono tabular-nums text-base">
          {display} = {exact}
        </p>
        {adjustment && <p>{adjustment}</p>}
        <p>
          <b>K</b> thousand · <b>M</b> million · <b>B</b> billion, rounded to the nearest step at the shown precision
          (ties round away from zero). The compact form is a reading aid, never the figure itself — the exact value
          beneath the headline is what rides the trace and the compute steps.
        </p>
      </div>
    </ProvModal>
  );
}

/** Opened by the class dots in the inspector popover's head (prov-inspector.tsx). */
export function LadderModal({ onClose }: { onClose: () => void }) {
  return (
    <ProvModal ariaLabel="Distance ladder" onClose={onClose}>
      <h2 className="text-lg font-bold mb-4">The distance ladder</h2>
      <LadderRung cls="emitted" name="Emitted">
        A field in the event&rsquo;s own log. <b>Proof:</b> the tx event logs on any explorer.
      </LadderRung>
      <LadderRung cls="state" name="State">
        Read from a contract slot at a block. <b>Proof:</b> re-run the eth_call at that block against any node —
        explorers only show the current head.
      </LadderRung>
      <LadderRung cls="oracle" name="Oracle">
        An on-chain price feed. <b>Proof:</b> the AnswerUpdated log for that round.
      </LadderRung>
      <div className="prov-split">
        <span className="prov-bar" />
        <span>on-chain, third-party verifiable · below needs Rails</span>
        <span className="prov-bar" />
      </div>
      <LadderRung cls="indexed" name="Indexed">
        Materialized by our backend. <b>No third-party proof</b> — you trust the indexer&rsquo;s replay. Bottoms out
        here.
      </LadderRung>
      <LadderRung cls="offchain" name="Off-chain">
        No on-chain anchor at all — an API price, an approximation. Nothing to verify against.
      </LadderRung>
      <p className="prov-prose">
        <b>Computed</b> isn&rsquo;t a rung — it&rsquo;s the operator between them, and it inherits the furthest class of
        its inputs. The result&rsquo;s badge is that <b>weakest link</b>. Temperature carries the split —{" "}
        <b>cool = on-chain</b>, <b>warm = trust required</b>. A categorical ladder, not a score.
      </p>
      <p className="prov-prose">
        <b>Delivery is not verification.</b> How Rails fetched a number — replayed by our indexer or read live from a
        node — is a freshness question, and both routes are still us. Verification points at a neutral third party (the
        tx logs, the oracle round) so the proof never passes through Rails at all.
      </p>
    </ProvModal>
  );
}

/** The receipt — the whole derivation in one static pane. Left: the displayed
 *  value (weakest-link class chip, `?` → distance ladder, summary, delivery
 *  `via`). Right: the equation — the formula, one row per operand leaf (its own
 *  distance-class dot + value + copy + contract), and the source coordinates
 *  (block / tx / contract) the flow was recorded at. Plain chain reads with no
 *  formula collapse gracefully to value + coordinates. */
export function ProvReceipt({
  info,
  value,
  display,
  symbol,
  source,
  embedded,
}: {
  info: Provenance;
  value: string;
  /** The value as it reads on the card (e.g. compact "3.27K") when that differs
   *  from the exact figure; the headline shows this, the exact value beneath. */
  display?: string | null;
  /** Token ticker riding beside the value on the card — headline icon. */
  symbol?: string | null;
  source: ProvSource | null;
  /** Inside the inspector's popover (prov-inspector.tsx, the one caller):
   *  single-column layout on the normal (non-inverted) surface, and nothing the
   *  popover's head already carries — the head owns the name and the value, so
   *  the headline block is dropped (the exact figure stays when the head shows
   *  a compact form), and the summary sheds its leading name clause. */
  embedded?: boolean;
}) {
  const chainId = useChainId();
  const [ladderOpen, setLadderOpen] = useState(false);
  const [notationOpen, setNotationOpen] = useState(false);

  const byLabel = (l: string) => info.inputs?.find((i) => i.label.toLowerCase() === l);
  // The scope's coordinates (an event card's block and tx), else the value's
  // own `source` slot — every state-read builder sets it (the market,
  // vault and hub vocabularies) — else a "block"/"tx" input. The slot went
  // unread from the panel's retirement (2026-07-22) to 2026-09-21: its one
  // reader was the panel's block strip, so a market receipt named its block
  // only in prose, with no copyable coordinate.
  const block = source?.block ?? info.source?.block ?? byLabel("block")?.value;
  const txHash = source?.txHash ?? info.source?.txHash ?? byLabel("tx")?.value;
  const stamp = source?.timestamp ?? info.source?.timestamp;
  // The value's class (weakest link for computed values) and its operand
  // leaves — the inputs, minus the block/tx chips that feed the coordinates
  // footer. Shared with the inspector's head via classifyValue.
  const { vcls, isComputed, leaves } = classifyValue(info);
  const hasSource = block != null || Boolean(txHash) || Boolean(info.contract);

  // Self-audit: every identifier the formula names should be traceable to an
  // input row. A named-but-untraced operand is exactly the gap the inspector
  // exists to expose, so it renders as a visible caution (plus a dev console
  // warning) rather than a silent, plausible-looking omission. Matching is
  // lenient (substring, either direction: "shares" ↔ "borrowShares") so only
  // wholly-missing operands flag. Runs only when the vocabulary enumerates
  // inputs at all — a zero-input indexed rollup is a different, visible state.
  const untraced =
    info.formula && leaves.length > 0
      ? [
          ...new Set(
            (info.formula.match(/\b[A-Za-z_][A-Za-z0-9_]{2,}\b/g) ?? []).filter((t) => {
              const lt = t.toLowerCase();
              if (FORMULA_STOPWORDS.has(lt)) return false;
              return !leaves.some((l) => {
                const ll = l.label.toLowerCase();
                return ll.includes(lt) || lt.includes(ll);
              });
            }),
          ),
        ]
      : [];
  useEffect(() => {
    if (untraced.length > 0 && process.env.NODE_ENV !== "production") {
      console.warn(
        `[provenance] formula names untraced input(s): ${untraced.join(", ")} — formula "${info.formula}" (${info.summary})`,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info]);
  const compacted = Boolean(display && display !== value);
  // Headline token icon: the captured ticker, else the vocabulary's "asset" leaf.
  const sym = symbol ?? byLabel("asset")?.value ?? null;
  // Embedded dedup: the popover's head already carries the name, the value and
  // the ticker, so the summary sheds its leading name clause (the head's label),
  // and an "asset" leaf that just echoes the head's ticker drops.
  const note = (() => {
    if (!embedded) return info.summary;
    // The SAME cut the head's label takes (splitSummary) — the body is the
    // tail of that cut, so it can never restate the header. An empty tail
    // renders no paragraph at all.
    const rest = splitSummary(info.summary).tail;
    if (!rest) return "";
    return rest.charAt(0).toUpperCase() + rest.slice(1);
  })();
  // The head's label already names the asset, so an embedded receipt never
  // restates it as an operand row.
  const shownLeaves = embedded ? leaves.filter((l) => l.label.toLowerCase() !== "asset") : leaves;
  // Embedded, an etherscan verify link rides the via line instead of its own
  // full-width row: the via segment naming the log becomes the link (the last
  // "log"/"logs" segment — nearest the field), so the check stays one click
  // away without a call-to-action above the prose. No matching segment →
  // a quiet trailing "verify" segment.
  const viaVerify = embedded && info.verify?.kind === "etherscan" && info.verify.href ? info.verify : null;
  const viaNode = (() => {
    let parts = info.via ? info.via.split(" · ") : [];
    // The receipt reads origin-only: the leading custody segment (the index /
    // stream name the vocabularies put first) drops whenever something more
    // specific follows it. The dock keeps the full via.
    if (embedded && parts.length > 1) parts = parts.slice(1);
    if (!viaVerify) return parts.length > 0 ? parts.join(" · ") : null;
    let linkIdx = -1;
    parts.forEach((s, i) => {
      if (/\blogs?\b/i.test(s)) linkIdx = i;
    });
    const link = (text: string) => (
      <a
        className="prov-via-verify"
        href={viaVerify.href}
        target="_blank"
        rel="noopener noreferrer"
        title={viaVerify.text}
      >
        {text}
        <ExternalLink aria-hidden />
      </a>
    );
    if (parts.length === 0) return link("verify");
    if (linkIdx === -1)
      return (
        <>
          {parts.join(" · ")} · {link("verify")}
        </>
      );
    return parts.map((s, i) => (
      <Fragment key={i}>
        {i > 0 && " · "}
        {i === linkIdx ? link(s) : s}
      </Fragment>
    ));
  })();

  return (
    <div className={`prov-receipt ${embedded ? "prov-receipt-embed " : ""}${CLASS_CSS[vcls]}`}>
      <div className="prov-ins-main">
        {!embedded && (
          <div className="prov-ins-head">
            <span className="prov-ins-label">displayed value</span>
            <span
              className={`prov-chip ${CLASS_CSS[vcls]}`}
              title={
                isComputed
                  ? `Computed value — the class is its furthest input's (the weakest link): ${CLASS_META[vcls]}`
                  : undefined
              }
            >
              <span className="prov-chip-dot" />
              {isComputed ? `Computed · ${CLASS_META[vcls]}` : CLASS_META[vcls]}
            </span>
            <button
              type="button"
              onClick={() => setLadderOpen(true)}
              title="Distance ladder"
              className="prov-laddertoggle"
            >
              <CircleHelp aria-hidden />
            </button>
          </div>
        )}
        {/* Headline = the value as it reads on the card, with the card's token
            icon. Compact forms get a "?" (the notation modal) and the exact
            from-the-block figure in small text directly beneath. Embedded, the
            accordion bar IS the headline, so only the exact figure renders (the
            bar shows the compact form). */}
        {!embedded && (
          <div className="prov-ins-value">
            {compacted ? display : value}
            {sym && (
              <span className="prov-ins-token">
                <TokenChipIcon symbol={sym} size={20} filterable={false} />
              </span>
            )}
            {compacted && (
              <button
                type="button"
                className="prov-fmt-help"
                title="Compact notation"
                onClick={() => setNotationOpen(true)}
              >
                <CircleHelp aria-hidden />
              </button>
            )}
          </div>
        )}
        {compacted && (
          <div className="prov-ins-exact">
            {value}
            {embedded && (
              <button
                type="button"
                className="prov-fmt-help"
                title="Compact notation"
                onClick={() => setNotationOpen(true)}
              >
                <CircleHelp aria-hidden />
              </button>
            )}
          </div>
        )}
        {info.verify && !viaVerify && <VerifyRow v={info.verify} />}
        {note && <p className="prov-note">{note}</p>}
        {info.scaling && /^-?\d+$/.test(info.scaling.raw) && (
          <p className="prov-note prov-scaling">
            {info.scaling.from === "call" ? "The contract returns" : "The log stores"} this as the whole number{" "}
            {info.scaling.raw}. {info.scaling.why}, so dividing by 10
            <sup>{info.scaling.places}</sup> gives {shiftDecimal(info.scaling.raw, info.scaling.places)}
            {info.scaling.unit ?? ""}.
          </p>
        )}
        {(info.via || viaVerify) && (
          <p className="prov-via">
            {info.via && "via "}
            {viaNode}
          </p>
        )}
      </div>

      {(info.formula || shownLeaves.length > 0 || hasSource) && (
        <div className="prov-eq">
          {info.formula && <div className="prov-formula">= {info.formula}</div>}
          {untraced.length > 0 && (
            <p className="prov-audit">
              <TriangleAlert aria-hidden />
              <span>
                Untraced input{untraced.length > 1 ? "s" : ""}: <b>{untraced.join(", ")}</b> — the formula names{" "}
                {untraced.length > 1 ? "them" : "it"} but no traced input carries {untraced.length > 1 ? "them" : "it"}.
                This trace is incomplete; treat the vocabulary as needing a fix.
              </span>
            </p>
          )}
          {shownLeaves.length > 0 && (
            <div className="prov-operands">
              {shownLeaves.map((inp, i) => {
                const cls = resolveClass(inp.kind, inp.pclass);
                return (
                  <Fragment key={i}>
                    <span className={`prov-row-dot ${CLASS_CSS[cls]}`} title={CLASS_META[cls]} />
                    <span className="prov-row-label">{inp.label}</span>
                    <span className="prov-row-cell">
                      {inp.value && <span className="prov-row-value">{inp.value}</span>}
                      {inp.contract && <ContractLink c={inp.contract} />}
                      {inp.verify?.kind === "etherscan" && inp.verify.href && (
                        <a href={inp.verify.href} target="_blank" rel="noopener noreferrer">
                          {inp.verify.text}
                        </a>
                      )}
                      {inp.note && <span className="prov-row-note">{inp.note}</span>}
                    </span>
                  </Fragment>
                );
              })}
            </div>
          )}
          {hasSource && (
            <div className="prov-src">
              <Box aria-hidden />
              {block != null && (
                <span className="prov-src-item">
                  <span className="prov-src-block">block {String(block)}</span>
                  <CopyBtn text={String(block)} title="Copy block number" />
                </span>
              )}
              {txHash && (
                <span className="prov-src-item">
                  <a href={explorerUrl(chainId, "tx-logs", txHash)} target="_blank" rel="noopener noreferrer">
                    tx {shortHex(txHash)}
                  </a>
                  <CopyBtn text={txHash} title="Copy tx hash" />
                </span>
              )}
              {stamp && <span>{stamp}</span>}
              {info.contract && <ContractLink c={info.contract} />}
            </div>
          )}
        </div>
      )}

      {ladderOpen && <LadderModal onClose={() => setLadderOpen(false)} />}
      {notationOpen && display && (
        <NotationModal display={display} exact={value} onClose={() => setNotationOpen(false)} />
      )}
    </div>
  );
}

// ── Receipt labels and keys ─────────────────────────────────────────────────
// What the inspector's popover head reads (prov-inspector.tsx): a receipt's
// name clause, and the key that finds every rendered instance of one figure.
// They outlived the per-card receipts panel they were written for (retired
// 2026-07-22 for the inspector).

const SUMMARY_SEPS = [" — ", " – ", ". "] as const;

/** Split a vocabulary summary into its name clause (the popover head's label)
 *  and the fuller explanation (the receipt's prose). The cut is the
 *  EARLIEST separator, and the head and the tail come from the SAME cut — so
 *  the body can never restate the header, and no prose between two separators
 *  can fall out of both surfaces. */
export const splitSummary = (s: string): { head: string; tail: string } => {
  let cut = -1;
  let len = 0;
  for (const sep of SUMMARY_SEPS) {
    const i = s.indexOf(sep);
    if (i > 0 && (cut < 0 || i < cut)) {
      cut = i;
      len = sep.length;
    }
  }
  if (cut < 0) return { head: s.replace(/\.$/, ""), tail: "" };
  return { head: s.slice(0, cut).replace(/\.$/, ""), tail: s.slice(cut + len).trim() };
};

/** Short row title for a receipt — the vocabulary summary's name clause (the
 *  text before its first " — " / sentence break). */
export const receiptLabel = (info: Provenance): string => {
  const s = splitSummary(info.summary).head;
  return s.length > 72 ? `${s.slice(0, 71)}…` : s;
};

/** The identity one figure is known by — what the locator pulse targets.
 *  Every registered instance sharing the key (header, detail, spine echo…) is
 *  the same figure. */
export const entryKey = (e: ProvReceiptEntry) => `${receiptLabel(e.info)}|${e.value}|${e.symbol ?? ""}`;

// ── The locator pulse ────────────────────────────────────────────────────────
// A pinned receipt passively points back at the card: every rendered
// instance of that figure becomes an inverted pill and HOLDS it for as long
// as the receipt is pinned (data-prov-active → globals.css).
// The pill's box is pre-reserved on every scoped <Prov> span (padding pulled
// back by equal negative margins), so activating shifts NOTHING — the pill
// paints outward into existing whitespace. Cleanup reverts it on unpin.
// No scroll when an instance is already in view — the connection is ambient,
// not commanded; only a fully off-screen value earns a minimal nearest-edge
// scroll so the colour lands somewhere visible.

const activateEl = (el: HTMLElement) => {
  el.setAttribute("data-prov-active", "");
};

const meaningfullyVisible = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 32 && r.top < window.innerHeight - 32;
};

/** Turn the receipt's card instance(s) teal; returns the deactivator. The
 *  target list is a GETTER, re-read at collapse: an instance can mount while
 *  the receipt is open (the detail's delta toggled into view — it self-
 *  activates from <Prov>'s register effect), and the sweep must catch it. */
export function locateEntries(getTargets: () => ProvReceiptEntry[]): () => void {
  const els = getTargets()
    .map((e) => e.el)
    .filter((el): el is HTMLElement => el != null && el.isConnected);
  if (els.length > 0) {
    if (!els.some(meaningfullyVisible)) els[0].scrollIntoView({ block: "nearest", behavior: "smooth" });
    for (const el of els) activateEl(el);
  }
  return () => {
    for (const e of getTargets()) e.el?.removeAttribute("data-prov-active");
  };
}

/** Wrap a displayed value. Inside a receipts scope the value is INERT content —
 *  it registers into the card's registry (the inspector's roster) and serves as
 *  the locator pulse's target, nothing more; the page-level inspector is the
 *  one entry point. Outside a scope it renders children verbatim (zero DOM
 *  change) — carry the wrapper anyway, so the value joins the inspector's reach
 *  the day its surface gains a scope.
 *
 *  Children must be INLINE-level. The wrapper is an inline span whose
 *  background becomes the locator pill: a block child (StatValue, StatFootnote,
 *  any div) splits the span into empty fragments, so the open receipt paints
 *  stray lozenges around a value that's lost its pill. Nest the other way —
 *  `<StatValue><Prov>…</Prov></StatValue>`. */
export function Prov({
  info,
  value,
  symbol,
  echo,
  icon,
  className,
  unscoped,
  children,
}: {
  info: Provenance;
  value?: string;
  /** Token ticker riding beside the value on the card (when the glyph itself
   *  sits outside this wrapper) — the receipt shows its icon by the headline. */
  symbol?: string;
  /** Register as an ECHO of an existing receipt (same info/value/symbol as the
   *  primary instance): a locator-pulse target only, never a row of its own.
   *  For a figure the card repeats through a different component. */
  echo?: boolean;
  /** Trailing token glyph towed INSIDE the wrapper, so the locator pulse's
   *  pill encloses value + icon as one unit (instead of the pill's edge
   *  tucking under a sibling icon). Rendered after the children behind
   *  data-prov-hidden — decoration, never part of the text capture. */
  icon?: ReactNode;
  /** Extra classes on the wrapper span itself. The load-bearing use is a
   *  responsive hide (header values hand off to the spine at ≥sm): hiding
   *  must land ON this span, not a child — a hidden child leaves the pill
   *  box painting an empty lozenge when the receipt opens. */
  className?: string;
  /** This figure is deliberately outside a receipts scope — it traces nothing
   *  here, and that is intended. Silences the dev unscoped warning for this one
   *  call site. For a whole scope-free render site, wrap it in <ProvUnscoped>
   *  instead of marking every figure. */
  unscoped?: boolean;
  children: ReactNode;
}) {
  const scope = useContext(ProvReceiptsScopeCtx);
  const unscopedBySite = useContext(ProvUnscopedCtx);
  const source = useContext(ProvSourceCtx);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  const registry = scope?.registry ?? null;
  // The page-level inspector's armed state — a boolean snapshot, so spans
  // re-render only on arm/disarm, never on registry churn. Only scoped values
  // subscribe meaningfully; outside a scope there is no registry to resolve a
  // receipt from, so the tool ignores the span.
  const inspecting =
    useSyncExternalStore(provInspector.subscribe, provInspector.getArmed, () => false) && registry != null;
  // Structured capture. `display` = the value as it READS on the card: the
  // rendered text minus decoration (`[data-prov-hidden]` — hover tooltips, token
  // glyphs), whitespace-collapsed. The exact figure comes from the `value` prop,
  // or a `[data-prov-exact]` attribute in the subtree (AssetAmount stamps one),
  // falling back to the display text. The ticker comes from the `symbol` prop or
  // a `[data-prov-symbol]` stamp. The receipt headlines the display form and
  // anchors the trace (copy, compute result) to the exact form.
  const capture = () => {
    const el = ref.current;
    let display = "";
    if (el) {
      const clone = el.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("[data-prov-hidden]").forEach((n) => n.remove());
      display = clone.textContent?.replace(/\s+/g, " ").trim() ?? "";
    }
    const exact = value ?? el?.querySelector("[data-prov-exact]")?.getAttribute("data-prov-exact") ?? display;
    const sym = symbol ?? el?.querySelector("[data-prov-symbol]")?.getAttribute("data-prov-symbol") ?? null;
    return { exact, display: display || exact, sym };
  };
  // Inside a receipts scope, every render reports the freshest capture into the
  // card's registry. register() no-ops (no emit) when nothing changed, so the
  // dependency-free effect can't loop.
  useEffect(() => {
    if (!registry) return;
    const { exact, display, sym } = capture();
    registry.register({ id, info, value: exact, display, symbol: sym, source, el: ref.current, echo });
  });
  useEffect(() => {
    if (!registry) return;
    return () => registry.unregister(id);
  }, [registry, id]);
  // The unscoped tripwire. Once per receipt label, so a listing of 100 rows
  // reports the shape of the gap rather than 100 copies of it.
  useEffect(() => {
    if (!DEV || registry || unscoped || unscopedBySite) return;
    const label = receiptLabel(info);
    if (warnedUnscoped.has(label)) return;
    warnedUnscoped.add(label);
    console.warn(
      `[provenance] "${label}" rendered OUTSIDE a receipts scope — it registers nothing, ` +
        `so the inspector has no row for it and the value traces to nothing. Mount it inside ` +
        `the card's <ProvReceiptsScope>, or declare the intent: <ProvUnscoped> around a ` +
        `scope-free render site, or unscoped on this one <Prov>.`,
    );
  }, [registry, unscoped, unscopedBySite, info]);
  // A towed icon rides behind data-prov-hidden: the capture clone strips it
  // (UnknownTokenSvg's fallback letter would otherwise garble the display
  // text), and the pill treats it as decoration inside the box.
  const iconNode = icon ? (
    <span data-prov-hidden="" className="inline-flex items-center">
      {icon}
    </span>
  ) : null;
  // Inside a receipts scope the value is pure content — no click, no underline,
  // no affordance — EXCEPT while the inspector is armed: then the span is a
  // click target that pins its receipt into the popover at the value. Disarmed,
  // it reverts to the fully inert markup (the capture source and the locator
  // pulse's target — data-prov-active lands here while its receipt is pinned).
  // The dev-only coverage stamp tells the tripwire this value is traced.
  const handlePick = (e: SyntheticEvent) => {
    // Header values sit inside the card's clickable detail-toggle div — a
    // pick must pin the receipt, never collapse the card.
    e.stopPropagation();
    e.preventDefault();
    if (!registry) return;
    const all = registry.getEntries();
    const self = all.find((x) => x.id === id);
    // Resolve to this figure's primary receipt — the first non-echo entry
    // sharing the key — so echo instances land on the right receipt. An echo
    // whose primary isn't mounted (a collapsed event card's header pill echoes
    // the detail grid, which mounts on expand) pins its OWN entry instead: it
    // carries the same full receipt info, so the armed click must never be a
    // silent no-op on a visible traced value.
    const row = self ? (all.find((x) => !x.echo && entryKey(x) === entryKey(self)) ?? self) : undefined;
    // Pin this figure's receipt into the popover at the value. Sticky — the
    // mode stays armed for the next value.
    if (row && ref.current) {
      provInspector.pin(row, registry, ref.current);
      return;
    }
    // The figure never registered at all — in dev, flag the gap; armed mode
    // simply keeps waiting.
    if (DEV) console.warn(`[provenance] inspected value has no receipt row: ${id}`);
  };
  const pickProps = inspecting
    ? {
        "data-prov-pickable": "",
        // The inspector's own stamp: a resting dotted underline on every
        // traceable value, so the armed mode shows its coverage map.
        "data-prov-inspect": "",
        role: "button",
        tabIndex: 0,
        "aria-label": `Show the receipt for ${receiptLabel(info)}`,
        onClick: handlePick,
        onKeyDown: (e: ReactKeyboardEvent<HTMLSpanElement>) => {
          if (e.key === "Enter" || e.key === " ") handlePick(e);
        },
      }
    : {};
  const extra = className ? ` ${className}` : "";
  if (scope)
    return (
      <span
        ref={ref}
        className={(icon ? "prov-locate-box prov-has-icon" : "prov-locate-box") + extra}
        {...(DEV ? { "data-prov-covered": "" } : {})}
        {...pickProps}
      >
        {children}
        {iconNode}
      </span>
    );
  if (icon)
    return (
      <span className={"inline-flex items-center gap-1" + extra}>
        {children}
        {iconNode}
      </span>
    );
  if (className) return <span className={className}>{children}</span>;
  return <>{children}</>;
}
