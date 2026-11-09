// ui-jobs 555, door 2 mock: "I have ETH and USDC: where could they go?"
// A /start step for a pair (agreed 9 Nov 2026): the hookless Uniswap pools
// for it as cards, in 553's card form, each figure windowed. Orders and
// "Show all" are links here; the build makes them the asset door's buttons.

import Link from "next/link";
import { notFound } from "next/navigation";
import { PAIRS, readPair, type PairKey, type PoolCard } from "../../_pairs";
import { LINK, MUTED, MockNote, day, num, pct } from "../../_ui";

export const dynamic = "force-dynamic";
export const PROV_EXEMPT = "ui-jobs 555 mock: receipts are written out as text; the build carries them";

const CARD = "block h-full rounded-xl border border-rb-200 bg-raised p-4 dark:border-rb-600";
const TEAL = "text-teal-600 hover:underline dark:text-teal-400";
const ORDERS = {
  size: "Largest",
  fees: "Highest 30-day fees",
  range: "Narrowest 90-day fee range",
} as const;
type Order = keyof typeof ORDERS;

const share = (x: number) => pct(x, 3).replace("+", "");
const spread = (c: PoolCard) => {
  const w = c.windows.filter((x): x is number => x !== null);
  return w.length === 3 ? Math.max(...w) - Math.min(...w) : null;
};
const desc = (a: number | null, b: number | null) => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : b - a);
const asc = (a: number | null, b: number | null) => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : a - b);

function order(cards: PoolCard[], o: Order) {
  const out = [...cards];
  if (o === "size") out.sort((a, b) => desc(a.size, b.size) || desc(a.windows[0], b.windows[0]));
  if (o === "fees") out.sort((a, b) => desc(a.windows[0], b.windows[0]));
  if (o === "range") out.sort((a, b) => asc(spread(a), spread(b)));
  return out;
}

function Figure({ label, value, sub }: { label: string; value: string | null; sub?: string | null }) {
  return (
    <div className="min-w-0">
      <dt className={`text-xs ${MUTED}`}>{label}</dt>
      <dd className={`truncate tabular-nums ${value ? "text-base font-semibold text-foreground" : `text-sm ${MUTED}`}`}>
        {value ?? "—"}
      </dd>
      {sub && <dd className={`truncate text-xs ${MUTED}`}>{sub}</dd>}
    </div>
  );
}

function Card({ c, quote, base }: { c: PoolCard; quote: string; base: string }) {
  const w = c.windows.filter((x): x is number => x !== null);
  return (
    <div className={CARD} data-pool-card={c.key} data-pool-card-aside={c.aside ?? undefined}>
      <div className="mb-3">
        <div className="font-medium text-foreground">
          {base}/{quote}
        </div>
        <div className={`text-xs ${MUTED}`}>{c.label} · Ethereum · no hook</div>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        <Figure
          label="Full-range fees, 30 days"
          value={c.windows[0] !== null ? share(c.windows[0]) : null}
          sub={
            w.length === 3
              ? `${share(Math.min(...w))} to ${share(Math.max(...w))} in each 30 days of 90`
              : "No 90-day range"
          }
        />
        <Figure
          label="Size"
          value={c.size !== null ? `${num(c.size)} ${quote}` : null}
          sub={
            c.size === null
              ? "Waits for the DEX lane"
              : c.sizeThen
                ? `${pct(c.size / c.sizeThen - 1, 1)} in 30 days`
                : "No 30-day figure"
          }
        />
        <Figure label="Price, 30 days" value={c.priceMove !== null ? pct(c.priceMove, 1) : null} />
        <Figure label="Protocol fee" value={c.protocolFee} />
      </dl>
      {c.aside && <p className={`mt-2 text-xs ${MUTED}`}>Set aside: {c.aside}.</p>}
    </div>
  );
}

export default async function MockPairDoor({
  params,
  searchParams,
}: {
  params: Promise<{ pair: string }>;
  searchParams: Promise<{ order?: string; all?: string }>;
}) {
  const [{ pair }, sp] = await Promise.all([params, searchParams]);
  if (!(pair in PAIRS)) notFound();
  const key = pair as PairKey;
  const { base, quote } = PAIRS[key];
  const o: Order = sp.order && sp.order in ORDERS ? (sp.order as Order) : "size";
  const all = sp.all === "1";
  const { cards, block, at } = await readPair(key);
  const aside = cards.filter((c) => c.aside);
  const drawn = order(all ? cards : cards.filter((c) => !c.aside), o);
  const href = (q: { order?: Order; all?: boolean }) => {
    const s = new URLSearchParams();
    const oo = q.order ?? o;
    if (oo !== "size") s.set("order", oo);
    if (q.all ?? all) s.set("all", "1");
    const qs = s.toString();
    return `/mock-555/pair/${key}${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="py-8">
      <MockNote>
        Door 2 for liquidity pools, a <code>/start</code> step beside 553&apos;s &quot;I have an asset&quot;. Read live
        at block {block.toLocaleString("en-US")} ({day(at)}) and at 30, 60 and 90 days back: four multicalls. Only pools
        without a hook at the standard tick spacings; hooked pools are found from <code>Initialize</code> logs and join
        with the DEX lane. A card has no page to open yet: Uniswap has no home on Rails.{" "}
        <Link href="/mock-555" className={LINK}>
          Door 1
        </Link>
      </MockNote>

      <div className="mb-4 flex flex-wrap gap-2 text-sm" role="group" aria-label="Pair">
        {(Object.keys(PAIRS) as PairKey[]).map((k) => (
          <Link
            key={k}
            href={`/mock-555/pair/${k}`}
            className={`rounded-full border px-3 py-0.5 ${
              k === key
                ? "border-rb-400 bg-rb-100 font-medium text-foreground dark:bg-rb-700"
                : `border-rb-200 dark:border-rb-600 ${TEAL}`
            }`}
          >
            {PAIRS[k].base} and {PAIRS[k].quote}
          </Link>
        ))}
      </div>

      <h1 className="mb-3 text-xl font-semibold text-foreground">
        Pools that take {base} and {quote}
      </h1>

      <div className="mb-2 flex flex-wrap items-center gap-x-1 gap-y-2 text-sm" role="group" aria-label="Order by">
        <span className={`mr-1 ${MUTED}`}>Order by</span>
        {(Object.keys(ORDERS) as Order[]).map((k) =>
          k === o ? (
            <span key={k} className="rounded-md bg-rb-100 px-2 py-0.5 font-medium text-foreground dark:bg-rb-700">
              {ORDERS[k]}
            </span>
          ) : (
            <Link key={k} href={href({ order: k })} className={`rounded-md px-2 py-0.5 ${TEAL}`}>
              {ORDERS[k]}
            </Link>
          ),
        )}
      </div>
      <p className={`mb-4 text-sm ${MUTED}`}>
        {o === "size"
          ? "Largest first, by the two balances valued at the pool's price; V4 pools after, since their size waits for the DEX lane."
          : o === "fees"
            ? "By what a full-range position earned in fees over the last 30 days, as a share of its value."
            : "By the spread of full-range fees across the three 30-day windows of the last 90 days."}{" "}
        A full-range position is the widest; a narrower range earns more while the price is inside it and nothing while
        it is outside. Rails does not forecast, rate or recommend.
      </p>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {drawn.map((c) => (
          <li key={c.key}>
            <Card c={c} quote={quote} base={base} />
          </li>
        ))}
      </ul>

      {aside.length > 0 && (
        <p className={`mt-5 text-sm ${MUTED}`}>
          {all ? "Showing" : "Setting aside"} {aside.length} {aside.length === 1 ? "pool" : "pools"} that are empty or
          thin in range, younger than 30 days, or show a 30-day fee figure above 10%; each card says which.{" "}
          <Link href={href({ all: !all })} className={TEAL}>
            {all ? "Hide them" : "Show them"}
          </Link>
        </p>
      )}
    </div>
  );
}
