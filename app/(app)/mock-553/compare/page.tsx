// ui-jobs 553, door 3 sketch: "I'm comparing vaults." Side by side: the
// five signals, fees, exposure and the holder donut. A preference orders the
// columns and emphasises rows; Rails scores nothing.

import Link from "next/link";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { formatCompact } from "@/lib/shared/format-compact";
import { shortAddress } from "@/lib/shared/vault-amount-text";
import { loadVaultIndex } from "@/lib/vaults/index-read";
import type { VaultSummary } from "@/lib/vaults/summary";
import { loadDaily, mockHref, nameOf, readout, type Readout, type SignalKey } from "../_signals";
import { CARD, LINK, MUTED, MockNote, VaultTitle } from "../_ui";

export const dynamic = "force-dynamic";
export const PROV_EXEMPT = "ui-jobs 553 mock: receipts are written out as text; the build carries them";

type Prefer = "steady" | "yield";

interface Slice {
  holder: string;
  share: number;
}

/** The largest holders' shares from the census (vault_positions), and the
 *  live count. Null where the family has no census. */
async function holders(v: VaultSummary): Promise<{ top: Slice[]; live: number } | null> {
  const base = process.env.RAILS_API_URL;
  if (!base || !v.census) return null;
  const families = v.family === "metamorpho" && v.chainId === 1 ? "&families=morpho" : "";
  try {
    const res = await fetch(
      `${base}/api/vaults/positions?chain=${v.chainId}&vault=${v.address}&status=live&sortBy=share&sortOrder=desc&limit=6&overlay=0${families}`,
      createAuthFetchOptions({ next: { revalidate: 3600 } }),
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { data?: { holder: string; sharePpm: string | null }[] };
    const top = (j.data ?? [])
      .map((r) => ({ holder: r.holder, share: Number(r.sharePpm ?? 0) / 1e6 }))
      .filter((s) => s.share > 0);
    return { top, live: v.census.live };
  } catch {
    return null;
  }
}

// The donut's colour exception (Miles, 9 Nov 2026): one hue per slice, since a
// slice is one holder and its colour means nothing; "others" grey.
const HUES = ["#4f7cff", "#e5833a", "#2fb38b", "#c75bd6", "#d6b52f", "#5bc3d6"];

function Donut({ top, live }: { top: Slice[]; live: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  let at = 0;
  const others = Math.max(0, 1 - top.reduce((a, s) => a + s.share, 0));
  const arcs = [
    ...top.map((s, i) => ({ ...s, color: HUES[i % HUES.length] })),
    { holder: "others", share: others, color: "var(--color-rb-300, #bbb)" },
  ];
  return (
    <div className="flex items-center gap-3">
      <svg width={88} height={88} viewBox="0 0 88 88" aria-hidden>
        <g transform="rotate(-90 44 44)">
          {arcs.map((a) => {
            const len = a.share * c;
            const el = (
              <circle
                key={a.holder}
                cx={44}
                cy={44}
                r={r}
                fill="none"
                stroke={a.color}
                strokeWidth={12}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-at}
              />
            );
            at += len;
            return el;
          })}
        </g>
        <text x={44} y={42} textAnchor="middle" className="fill-foreground text-[13px] font-semibold">
          {live < 1000 ? live.toLocaleString("en-US") : formatCompact(live)}
        </text>
        <text x={44} y={55} textAnchor="middle" className="fill-rb-500 text-[9px]">
          holders
        </text>
      </svg>
      <ul className="text-xs">
        {arcs.slice(0, 4).map((a) => (
          <li key={a.holder} className="flex items-center gap-1.5 tabular-nums">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: a.color }} />
            {a.holder === "others" ? "others" : shortAddress(a.holder)} {(a.share * 100).toFixed(1)}%
          </li>
        ))}
        {arcs.length > 5 && <li className={MUTED}>+{arcs.length - 5} more named</li>}
      </ul>
    </div>
  );
}

const ROWS: { key: SignalKey | "fees" | "exposure" | "holders"; label: string; emphasis: Prefer[] }[] = [
  { key: "earning", label: "Earning steadily", emphasis: ["steady", "yield"] },
  { key: "size", label: "Growing or shrinking", emphasis: [] },
  { key: "exit", label: "Can I get out today", emphasis: ["steady"] },
  { key: "losses", label: "Has it lost money", emphasis: ["steady"] },
  { key: "steward", label: "Who runs it", emphasis: [] },
  { key: "fees", label: "Fees", emphasis: ["yield"] },
  { key: "exposure", label: "Where the money is lent", emphasis: ["steady"] },
  { key: "holders", label: "Who holds it", emphasis: [] },
];

export default async function MockCompare({
  searchParams,
}: {
  searchParams: Promise<{ v?: string; prefer?: string }>;
}) {
  const sp = await searchParams;
  const prefer: Prefer = sp.prefer === "yield" ? "yield" : "steady";
  const { vaults } = await loadVaultIndex();
  const held = (v: VaultSummary) => (v.totalAssets?.value ?? 0) - (v.lostAssets?.value ?? 0);
  const picked = sp.v
    ? sp.v
        .split(",")
        .map((k) => vaults.find((v) => `${v.chainId}:${v.address}` === k.toLowerCase()))
        .filter((v): v is VaultSummary => v != null)
    : // Default: the largest USDC vault of each family the index holds.
      [
        ...vaults
          .filter((v) => v.asset.symbol === "USDC" && !v.illiquid && !v.standing.includes("lost-assets"))
          .sort((a, b) => held(b) - held(a))
          .reduce((m, v) => (m.has(v.family) ? m : m.set(v.family, v)), new Map<string, VaultSummary>())
          .values(),
      ].slice(0, 4);
  const daily = await loadDaily(picked);
  const cols = await Promise.all(
    picked.map(async (v) => ({ v, r: readout(v, daily.get(`${v.chainId}:${v.address}`)), h: await holders(v) })),
  );
  const y = (r: Readout) => r.earning.y30 ?? -Infinity;
  // A flat share price is no earner: it sorts after every measured spread.
  const spread = (r: Readout) =>
    r.earning.word === "Flat" || r.earning.high == null || r.earning.low == null
      ? Infinity
      : r.earning.high - r.earning.low;
  cols.sort((a, b) => (prefer === "yield" ? y(b.r) - y(a.r) : spread(a.r) - spread(b.r)));
  const qs = sp.v ? `v=${sp.v}&` : "";

  const cell = (key: (typeof ROWS)[number]["key"], c: (typeof cols)[number]) => {
    if (key === "fees")
      return (
        <span className={MUTED}>
          {c.v.family === "metamorpho"
            ? "Performance fee: from its SetFee history; fee() not read yet"
            : "Not read yet"}
        </span>
      );
    if (key === "exposure")
      return (
        <span className={MUTED}>
          {c.v.family === "metamorpho"
            ? "Its markets and their shares (the vault page's legs)"
            : c.v.family === "yearn-v3"
              ? "Its strategies' debt"
              : c.v.family === "stata" || c.v.family === "umbrella-stake"
                ? "One Aave reserve"
                : c.v.family === "sgho"
                  ? "GHO, by rule"
                  : "Loans and strategies"}{" "}
          (on the build)
        </span>
      );
    if (key === "holders")
      return c.h && c.h.top.length ? (
        <Donut top={c.h.top} live={c.h.live} />
      ) : (
        <span className={MUTED}>No census for this family</span>
      );
    const s = c.r[key];
    return (
      <div>
        {s.word && <div className="font-semibold text-foreground">{s.word}</div>}
        <div className={s.state === "missing" ? MUTED : "text-foreground"}>{s.sentence}</div>
      </div>
    );
  };

  return (
    <div className="py-8">
      <MockNote>
        A sketch with live figures. Columns default to the largest USDC vault of each family; pass{" "}
        <code>?v=chainId:address,…</code> to choose. Fees and exposure are placeholders; the donut is the census&apos;s
        largest live holders.
      </MockNote>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">Compare vaults</h1>
        <div className="flex items-center gap-2 text-sm">
          <span className={MUTED}>I care most about</span>
          {(["steady", "yield"] as Prefer[]).map((p) => (
            <Link
              key={p}
              href={`/mock-553/compare?${qs}prefer=${p}`}
              className={`rounded-md px-2 py-0.5 ${p === prefer ? "bg-rb-100 font-medium text-foreground dark:bg-rb-700" : LINK}`}
            >
              {p === "steady" ? "Steady" : "Yield"}
            </Link>
          ))}
        </div>
      </div>
      <p className={`mb-4 text-sm ${MUTED}`}>
        {prefer === "steady"
          ? "Ordered by how little the 30-day yield moved over 90 days. Exits, losses and exposure are brought forward."
          : "Ordered by the 30-day yield. Fees are brought forward."}{" "}
        The order is a sort of measured figures; Rails does not rate the vaults.
      </p>
      <div className={`${CARD} overflow-x-auto`}>
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-rb-200 dark:border-rb-600">
              <th className="w-40 p-3" />
              {cols.map((c) => (
                <th key={c.v.address} className="p-3 text-left align-top font-normal">
                  <Link href={mockHref(c.v)}>
                    <VaultTitle v={c.v} />
                  </Link>
                  <div className={`mt-1 text-xs ${MUTED}`}>
                    {formatCompact(held(c.v))} {c.v.asset.symbol}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => {
              const on = row.emphasis.includes(prefer);
              return (
                <tr
                  key={row.key}
                  className={`border-b border-rb-200 align-top last:border-0 dark:border-rb-600 ${on ? "bg-blue-500/5" : ""}`}
                >
                  <th className={`p-3 text-left ${on ? "font-semibold text-foreground" : `font-normal ${MUTED}`}`}>
                    {row.label}
                  </th>
                  {cols.map((c) => (
                    <td key={c.v.address} className="p-3">
                      {cell(row.key, c)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
