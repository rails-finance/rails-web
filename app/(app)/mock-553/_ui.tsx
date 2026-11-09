// ui-jobs 553, step 1: the mock's parts. Plain server components on house
// tokens; none of them is shared with the live pages.

import type { ReactNode } from "react";
import { MoreVertical } from "lucide-react";
import { VaultLead } from "@/components/vaults/vault-heads";
import { VAULT_FAMILIES } from "@/lib/vaults/families";
import { chainName } from "@/lib/vaults/index-rosters";
import type { VaultSummary } from "@/lib/vaults/summary";
import { nameOf, type Read, type Readout, type Signal } from "./_signals";

export const CARD = "rounded-xl border border-rb-200 bg-raised dark:border-rb-600";
export const MUTED = "text-rb-500 dark:text-rb-400";
export const LINK = "text-[var(--text-link)] hover:underline";

/** A note on the mock itself: what is real, what is a placeholder. */
export function MockNote({ children }: { children: ReactNode }) {
  return (
    <p className="mb-6 rounded-lg border border-dashed border-rb-300 px-3 py-2 text-xs text-rb-500 dark:border-rb-600">
      <span className="font-semibold">Mock (ui-jobs 553).</span> {children}
    </p>
  );
}

export function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {sub && <p className={`text-xs ${MUTED}`}>{sub}</p>}
      </div>
      <span
        className={`mt-0.5 ${MUTED}`}
        title="The section's ⋮: Rails pages, off-site links, exports, Inspect provenance"
      >
        <MoreVertical size={16} aria-hidden />
      </span>
    </div>
  );
}

export function VaultTitle({ v }: { v: VaultSummary }) {
  return (
    <div className="flex items-center gap-3">
      <VaultLead vault={v} size={32} />
      <div>
        <div className="text-lg font-semibold text-foreground">{nameOf(v)}</div>
        <div className={`text-xs ${MUTED}`}>
          {VAULT_FAMILIES[v.family].singular} · {chainName(v.chainId)} · {v.asset.symbol}
        </div>
      </div>
    </div>
  );
}

const STATE_DOT: Record<Signal["state"], string> = {
  read: "bg-rb-500",
  partial: "border border-rb-500",
  missing: "border border-dashed border-rb-400",
};

/** One readout line: the question, a one-word answer, the sentence, and the
 *  receipt the ⋮ would open. No colour carries a verdict: Rails does not
 *  score risk. The dot says how much of the line Rails can answer today. */
export function SignalRow({ s, compact = false }: { s: Signal; compact?: boolean }) {
  return (
    <li className="flex gap-3 py-3" data-signal={s.key} data-signal-state={s.state}>
      <span className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${STATE_DOT[s.state]}`} aria-hidden />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium text-foreground">{s.label}</span>
          {s.word && <span className="text-sm font-semibold text-foreground">· {s.word}</span>}
        </div>
        <p className={`text-sm ${s.state === "missing" ? MUTED : "text-foreground"}`}>{s.sentence}</p>
        {!compact && s.receipt.length > 0 && (
          <p className={`mt-0.5 text-xs ${MUTED}`}>Receipt: {s.receipt.join("; ")}</p>
        )}
      </div>
    </li>
  );
}

export function ReadoutCard({ r, title = "How the vault is doing" }: { r: Readout; title?: string }) {
  return (
    <section className={`${CARD} p-4`}>
      <SectionHead title={title} sub="Measured from the chain. Rails states the figures and does not score risk." />
      <ul className="divide-y divide-rb-200 dark:divide-rb-600">
        {[r.size, r.earning, r.exit, r.losses, r.steward].map((s) => (
          <SignalRow key={s.key} s={s} />
        ))}
      </ul>
      <p className={`mt-2 flex flex-wrap gap-x-4 text-xs ${MUTED}`}>
        <span>
          <span className={`mr-1 inline-block h-2 w-2 rounded-full ${STATE_DOT.read}`} /> read today
        </span>
        <span>
          <span className={`mr-1 inline-block h-2 w-2 rounded-full ${STATE_DOT.partial}`} /> part read
        </span>
        <span>
          <span className={`mr-1 inline-block h-2 w-2 rounded-full ${STATE_DOT.missing}`} /> not read for this family
        </span>
      </p>
    </section>
  );
}

/** A line through daily values, no axes: the shape, with the ends labelled. */
export function Spark({ reads, width = 320, height = 64 }: { reads: Read[]; width?: number; height?: number }) {
  if (reads.length < 2) return null;
  const xs = reads.map((r) => r.day);
  const ys = reads.map((r) => r.value);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const px = (x: number) => ((x - x0) / Math.max(1, x1 - x0)) * (width - 4) + 2;
  const py = (y: number) => height - 4 - ((y - y0) / Math.max(1e-12, y1 - y0)) * (height - 8);
  const d = reads.map((r, i) => `${i ? "L" : "M"}${px(r.day).toFixed(1)},${py(r.value).toFixed(1)}`).join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="block" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-blue-500" />
    </svg>
  );
}
