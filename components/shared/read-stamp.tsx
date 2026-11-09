"use client";

// The read stamp at the right of a section heading (rails-ops ui-jobs 549/550,
// proposal §2): the time of the read behind the section's figures, "Read 10:12
// UTC", muted at 11px. The block, the contracts and functions read, and the
// server read it came through are its receipt (`readStampProv`), one inspector
// click away. A read served from rails-server's stored snapshot because the
// latest read failed keeps its warning on the surface: "Read 10:12 UTC, 3
// hours ago; the latest read failed".
//
// The time is rails-server's read time where it read the block, else the
// block's own time, asked of `/api/chain/block-time` where the page does not
// carry it. Times print from UTC fields, so the server and the browser write
// the same text; the age waits for the mount, since the server's clock is not
// the reader's.
//
// Not H6's `ReadStamp` (components/wallet/read-stamp.tsx), which states a
// roster's age behind the block-and-clock glyph.

import { useEffect, useState } from "react";
import { Prov, type Provenance, type ProvInput } from "@/components/shared/provenance";
import { chainMeta, explorerUrl, type ChainId } from "@/lib/shared/chains";
import { serverReadVia, type ServerRead } from "@/lib/shared/server-head-read";

const n = (v: number) => v.toLocaleString("en-US");

/** A block's time in seconds: `known` where the page has it, else asked of
 *  `/api/chain/block-time` after the mount; null until it answers or where
 *  it fails. */
export function useBlockTime(chainId: ChainId, block: number | null | undefined, known?: number | null): number | null {
  const [asked, setAsked] = useState<{ block: number; at: number } | null>(null);
  const need = known == null && block != null && block > 0 ? block : null;
  useEffect(() => {
    if (need == null) return;
    const ctl = new AbortController();
    fetch(`/api/chain/block-time?chain=${chainId}&block=${need}`, { signal: ctl.signal })
      .then((res) => (res.ok ? (res.json() as Promise<{ blockTimestamp?: number }>) : null))
      .then((d) => {
        if (typeof d?.blockTimestamp === "number") setAsked({ block: need, at: d.blockTimestamp });
      })
      .catch(() => undefined);
    return () => ctl.abort();
  }, [chainId, need]);
  if (known != null) return known;
  return asked && asked.block === need ? asked.at : null;
}

/** "10:12 UTC" from seconds. */
export const utcClock = (at: number): string => `${new Date(at * 1000).toISOString().slice(11, 16)} UTC`;

/** "3 hours ago" from an age in seconds. */
export function ageWords(seconds: number): string {
  const min = Math.floor(seconds / 60);
  if (min < 1) return "under a minute ago";
  if (min < 60) return `${min} ${min === 1 ? "minute" : "minutes"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr} ${hr === 1 ? "hour" : "hours"} ago`;
  const d = Math.floor(hr / 24);
  return `${d} days ago`;
}

/** One contract the section read, and what it asked of it. */
export interface ReadContract {
  name: string;
  address: string;
  /** The functions, as the receipt lists them: "totalAssets(), totalSupply()". */
  reads: string;
}

/** The stamp's receipt: the block (linked), each contract and its functions,
 *  and the read's path. */
export function readStampProv({
  chainId,
  block,
  at,
  readBy,
  what,
  contracts,
}: {
  chainId: ChainId;
  block: number;
  /** The block's time, seconds; null where it is not known. */
  at: number | null;
  readBy?: ServerRead | null;
  /** What the section's figures are, for the summary: "Every figure on this card". */
  what: string;
  contracts: ReadContract[];
}): Provenance {
  const explorer = chainMeta(chainId).explorerName;
  const time = at == null ? "" : ` (${new Date(at * 1000).toISOString().slice(0, 19).replace("T", " ")} UTC)`;
  const path = readBy
    ? readBy.stored
      ? "rails-server's stored snapshot, because the latest read failed"
      : "rails-server's read of the chain"
    : "Rails's read of the chain at page load";
  const inputs: ProvInput[] = contracts.map((c) => ({
    label: c.name,
    value: c.reads,
    kind: "chain",
    pclass: "state",
    contract: { name: c.name, address: c.address },
    verify: { kind: "etherscan", href: explorerUrl(chainId, "address", c.address), text: `${c.name} on ${explorer}` },
  }));
  return {
    kind: "chain",
    pclass: "state",
    source: { block },
    summary: `${what} was read at block ${n(block)}${time}, through ${path}. The stamp shows the time of that read.`,
    ...(contracts[0] ? { contract: { name: contracts[0].name, address: contracts[0].address } } : {}),
    via: `eth_call @ block ${n(block)}${serverReadVia(readBy)}`,
    verify: { kind: "etherscan", href: explorerUrl(chainId, "block", block), text: `Block ${n(block)} on ${explorer}` },
    inputs,
  };
}

/** "Read 10:12 UTC" with its receipt. */
export function SectionReadStamp({
  chainId,
  block,
  blockTime,
  readBy,
  info,
}: {
  chainId: ChainId;
  block: number;
  /** The block's time, seconds, where the page has it. */
  blockTime?: number | null;
  readBy?: ServerRead | null;
  /** The receipt; `readStampProv` builds it. */
  info: (at: number | null) => Provenance;
}) {
  const served = readBy?.readAt ? Math.floor(Date.parse(readBy.readAt) / 1000) : null;
  const known = Number.isFinite(served) && served != null ? served : (blockTime ?? (readBy?.blockTime || null));
  const at = useBlockTime(chainId, block, known);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now() / 1000);
    const id = setInterval(() => setNow(Date.now() / 1000), 60_000);
    return () => clearInterval(id);
  }, []);
  const stored = readBy?.stored === true;
  const age = at != null && now != null ? Math.max(0, now - at) : null;
  // The age joins the time once it says something: a stored read, or a read
  // an hour old.
  const aged = age != null && (stored || age >= 3600) ? `, ${ageWords(age)}` : "";
  const text = at == null ? "Read" : `Read ${utcClock(at)}${aged}${stored ? "; the latest read failed" : ""}`;
  return (
    <span
      className={`whitespace-nowrap text-[11px] tabular-nums ${stored ? "text-tone-caution" : "text-rb-500"}`}
      data-anatomy="K2"
      data-read-stamp=""
      data-read-block={block}
      data-read-at={at ?? ""}
      data-read-stored={stored ? "" : undefined}
    >
      <Prov info={info(at)}>{text}</Prov>
    </span>
  );
}
