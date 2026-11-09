// ui-jobs 553, door 2 mock: "I have USDC: where could it go?" Pick an
// asset, then a short list of cards (venue, yield, size, who runs it, can I
// withdraw today), the dense index one click behind. Live from the index.

import Link from "next/link";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { formatCompact } from "@/lib/shared/format-compact";
import { loadVaultIndex } from "@/lib/vaults/index-read";
import { VAULT_FAMILIES } from "@/lib/vaults/families";
import { chainName, VAULT_INDEX_HREF_FOR_MOCK } from "../../_links";
import { loadDaily, mockHref, nameOf, readout, type Readout } from "../../_signals";
import { CARD, LINK, MUTED, MockNote } from "../../_ui";
import { VaultLead } from "@/components/vaults/vault-heads";
import type { VaultSummary } from "@/lib/vaults/summary";

export const dynamic = "force-dynamic";
export const PROV_EXEMPT = "ui-jobs 553 mock: the index carries no receipts; each vault's page keeps them";

const SHOWN = 9;
const ORDERS = { size: "Largest", yield: "Highest yield", steady: "Steadiest" } as const;
type Order = keyof typeof ORDERS;

const held = (v: VaultSummary) => (v.totalAssets?.value ?? 0) - (v.lostAssets?.value ?? 0);

export default async function MockAssetDoor({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ order?: string; all?: string }>;
}) {
  const [{ symbol }, sp] = await Promise.all([params, searchParams]);
  const order: Order = sp.order === "yield" || sp.order === "steady" ? sp.order : "size";
  const { vaults } = await loadVaultIndex();

  // The asset chips: the assets with the most vaults holding something.
  const counts = new Map<string, number>();
  for (const v of vaults)
    if (v.asset.named && held(v) > 0) counts.set(v.asset.symbol, (counts.get(v.asset.symbol) ?? 0) + 1);
  const assets = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const sym = assets.find(([s]) => s.toLowerCase() === symbol.toLowerCase())?.[0] ?? symbol.toUpperCase();

  // The candidates: this asset's vaults by size; the series are read for the
  // largest 40, so "steady" and "yield" order among vaults of some size.
  const mine = vaults.filter((v) => v.asset.symbol === sym && held(v) > 0).sort((a, b) => held(b) - held(a));
  // Set aside by default, each for a stated chain reading: an illiquid vault
  // (ui-jobs 540) and one with lost assets (543). Rails scores nothing; the
  // line under the cards names them and opens them.
  const aside = (v: VaultSummary) => Boolean(v.illiquid) || v.standing.includes("lost-assets");
  const all = sp.all === "1";
  const setAside = mine.filter(aside);
  const pool = (all ? mine : mine.filter((v) => !aside(v))).slice(0, 40);
  const daily = await loadDaily(pool);
  const rows = pool.map((v) => ({ v, r: readout(v, daily.get(`${v.chainId}:${v.address}`)) }));
  const y = (r: Readout) => r.earning.y30 ?? -Infinity;
  // A flat share price is no earner: it sorts after every measured spread.
  const spread = (r: Readout) =>
    r.earning.word === "Flat" || r.earning.high == null || r.earning.low == null
      ? Infinity
      : r.earning.high - r.earning.low;
  if (order === "yield") rows.sort((a, b) => y(b.r) - y(a.r));
  if (order === "steady") rows.sort((a, b) => spread(a.r) - spread(b.r) || y(b.r) - y(a.r));
  const shown = rows.slice(0, SHOWN);

  return (
    <div className="py-8">
      <MockNote>
        Live from the vault index. On the build this is a step of /start (&quot;I have an asset&quot;), owning no vault
        page: each card opens the vault under its protocol (decision 0028 point 8). Cards here open the door-1 mock
        instead.
      </MockNote>
      <h1 className="mb-1 font-sans text-[clamp(28px,4.5vw,44px)] font-semibold leading-tight tracking-tight text-foreground">
        Where could your {sym} go?
      </h1>
      <p className={`mb-5 text-sm ${MUTED}`}>
        {mine.length.toLocaleString("en-US")} vaults on Ethereum and Base take {sym}. These are the {SHOWN}{" "}
        {order === "size"
          ? "largest"
          : order === "yield"
            ? "highest-earning of the largest 40"
            : "steadiest earners of the largest 40"}
        .
      </p>

      <div className="mb-4 flex flex-wrap gap-2" role="list" aria-label="Asset">
        {assets.map(([s, n]) => (
          <Link
            key={s}
            href={`/mock-553/asset/${s.toLowerCase()}${order === "size" ? "" : `?order=${order}`}`}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
              s === sym ? "border-blue-500 text-foreground" : "border-rb-200 text-rb-500 dark:border-rb-600"
            }`}
          >
            <TokenChipIcon symbol={s} size={16} filterable={false} untitled />
            {s} <span className="text-xs text-rb-400">{n}</span>
          </Link>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className={MUTED}>Order by</span>
        {(Object.keys(ORDERS) as Order[]).map((o) => (
          <Link
            key={o}
            href={`/mock-553/asset/${sym.toLowerCase()}${o === "size" ? "" : `?order=${o}`}`}
            className={`rounded-md px-2 py-0.5 ${o === order ? "bg-rb-100 font-medium text-foreground dark:bg-rb-700" : LINK}`}
          >
            {ORDERS[o]}
          </Link>
        ))}
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map(({ v, r }) => (
          <li key={`${v.chainId}:${v.address}`}>
            <Link
              href={mockHref(v)}
              className={`${CARD} block p-4 transition-colors duration-150 hover:border-blue-500`}
              data-asset-card
            >
              <div className="mb-3 flex items-center gap-2.5">
                <VaultLead vault={v} size={28} />
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground">{nameOf(v)}</div>
                  <div className={`flex items-center gap-1 text-xs ${MUTED}`}>
                    <ProtocolIcon id={VAULT_FAMILIES[v.family].venue} className="h-3 w-3" />
                    {VAULT_FAMILIES[v.family].singular} · {chainName(v.chainId)}
                  </div>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <div>
                  <dt className={`text-xs ${MUTED}`}>Yield, 30 days</dt>
                  <dd className="text-lg font-semibold tabular-nums text-foreground">
                    {r.earning.y30 != null ? `${(r.earning.y30 * 100).toFixed(1)}%` : "—"}
                  </dd>
                  <dd className={`text-xs ${MUTED}`}>
                    {r.earning.low != null && r.earning.high != null
                      ? `${(r.earning.low * 100).toFixed(1)} to ${(r.earning.high * 100).toFixed(1)}% over 90 days`
                      : "no 90-day range"}
                  </dd>
                </div>
                <div>
                  <dt className={`text-xs ${MUTED}`}>Size</dt>
                  <dd className="text-lg font-semibold tabular-nums text-foreground">
                    {formatCompact(held(v))} <span className="text-sm font-normal">{sym}</span>
                  </dd>
                  <dd className={`text-xs ${MUTED}`}>
                    {r.size.word ? `${r.size.word} over 30 days` : "no 30-day series"}
                  </dd>
                </div>
                <div>
                  <dt className={`text-xs ${MUTED}`}>Who runs it</dt>
                  <dd className="text-foreground">
                    {v.steward ? `${v.steward.address.slice(0, 6)}…${v.steward.address.slice(-4)}` : "—"}
                  </dd>
                </div>
                <div>
                  <dt className={`text-xs ${MUTED}`}>Withdraw today</dt>
                  <dd className={r.exit.word ? "text-foreground" : MUTED}>{r.exit.word ?? "not measured"}</dd>
                </div>
              </dl>
            </Link>
          </li>
        ))}
      </ul>

      {setAside.length > 0 && (
        <p className={`mt-5 text-sm ${MUTED}`}>
          {all ? "Including" : "Set aside"} {setAside.length} {sym} vaults whose money is mostly in markets borrowed to
          the rate ceiling, or that record lost assets
          {setAside[0] ? `, the largest ${nameOf(setAside[0])} (${formatCompact(held(setAside[0]))} ${sym})` : ""}.{" "}
          <Link
            href={`/mock-553/asset/${sym.toLowerCase()}?${order === "size" ? "" : `order=${order}&`}${all ? "" : "all=1"}`}
            className={LINK}
          >
            {all ? "Set them aside" : "Show them"}
          </Link>
        </p>
      )}
      <p className="mt-3 text-sm">
        <Link href={`${VAULT_INDEX_HREF_FOR_MOCK}?asset=${encodeURIComponent(sym)}`} className={LINK}>
          All {mine.length.toLocaleString("en-US")} {sym} vaults
        </Link>
        <span className={MUTED}> in the full index, with every column and filter.</span>
      </p>
    </div>
  );
}
