"use client";

// The /vaults (i), after the read stamp (rails-ops ui-jobs 776): it opens the
// index's census as a breakdown, the shell of a stat's breakdown
// (components/shared/stat-breakdown.tsx, `data-breakdown-panel="popover"`, the
// bottom sheet on a phone) without the donut. One row per roster, a family on
// a chain: its roster's link, its count and its read block, each with its
// receipt.

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { AnchoredPanel } from "@/components/shared/asset-popover";
import { InfoDisclosureTrigger } from "@/components/shared/info-disclosure";
import { Prov } from "@/components/shared/provenance";
import { RosterBlock } from "@/components/vaults/roster-read-stamp";
import { OVERLAY_HEADING, PAGE_LINK } from "@/lib/shared/ui-grammar";
import type { ChainId } from "@/lib/shared/chains";
import { rosterCountProv, type RosterRead } from "@/lib/vaults/roster-provenance";
import {
  chainName,
  VAULT_INDEX_PROTOCOL_LABEL,
  vaultIndexRosterHref,
  vaultIndexRosterKey,
  type VaultIndexRoster,
} from "@/lib/vaults/index-rosters";

const n = (v: number) => v.toLocaleString("en-US");
const TITLE = "Every vault the rosters list";

export function VaultIndexBreakdown({
  rosters,
  total,
  readOf,
}: {
  /** The rosters that answered, in the index's order. */
  rosters: VaultIndexRoster[];
  /** The rows the index holds across them. */
  total: number;
  readOf: (r: VaultIndexRoster) => RosterRead;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();
  const body = useRef<HTMLDivElement | null>(null);
  // Opening moves focus into the panel; closing returns it to the (i).
  useEffect(() => {
    if (!open) return;
    const f = requestAnimationFrame(() => body.current?.focus());
    return () => cancelAnimationFrame(f);
  }, [open]);
  return (
    <>
      <InfoDisclosureTrigger
        ref={button}
        open={open}
        onToggle={() => setOpen((o) => !o)}
        label="about these vaults"
        ariaControls={open ? panelId : undefined}
      />
      {open && (
        <AnchoredPanel
          id={panelId}
          label={TITLE}
          anchor={() => button.current}
          onClose={() => {
            setOpen(false);
            button.current?.focus();
          }}
          fit={420}
          drop
          name="breakdown-panel"
          surface="overlay"
        >
          <div ref={body} tabIndex={-1} className="outline-none" data-index-counts={total} data-anatomy="V6.1">
            <p className="mb-3 pr-8 sm:pr-0" data-breakdown-heading="">
              <span className={OVERLAY_HEADING}>{TITLE}</span>
            </p>
            <table className="border-collapse text-sm">
              <thead className="sr-only">
                <tr>
                  <th>Roster</th>
                  <th>Vaults</th>
                  <th>Read at</th>
                </tr>
              </thead>
              <tbody>
                {rosters.map((r) => {
                  const read = readOf(r);
                  return (
                    <tr
                      key={vaultIndexRosterKey(r)}
                      className="border-t border-rb-300 first:border-t-0 dark:border-rb-700"
                      data-anatomy="V6.2"
                      data-breakdown-row={vaultIndexRosterKey(r)}
                      data-index-key={vaultIndexRosterKey(r)}
                      data-index-count={r.protocol}
                      data-count={r.count}
                      data-index-roster={r.protocol}
                      data-index-chain={r.chainId}
                      data-index-block={r.blockNumber}
                    >
                      <th scope="row" className="whitespace-nowrap py-1 pr-4 text-left font-normal">
                        <Link href={vaultIndexRosterHref(r.protocol, r.chainId)} className={PAGE_LINK} prefetch={false}>
                          {VAULT_INDEX_PROTOCOL_LABEL[r.protocol]}
                        </Link>{" "}
                        <span className="text-rb-500">on {chainName(r.chainId)}</span>
                      </th>
                      <td className="whitespace-nowrap py-1 pr-4 text-right tabular-nums text-foreground">
                        <Prov info={rosterCountProv(read, r.count)}>{n(r.count)}</Prov>
                      </td>
                      <td className="whitespace-nowrap py-1 text-rb-500">
                        at <RosterBlock read={read} chainId={r.chainId as ChainId} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-rb-500">Each row of the index opens under its protocol.</p>
          </div>
        </AnchoredPanel>
      )}
    </>
  );
}
