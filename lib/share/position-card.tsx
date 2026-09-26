// The one shared position-card renderer — every family's `opengraph-image.tsx`
// ends up here with a small, already-formatted model, and this file turns
// that model into the 1200×630 PNG.
// ----------------------------------------------------------------------------
// SERVER-ONLY: it reads font and icon bytes off disk with `fs`. It must never
// be imported from a client component — nothing here is meant to reach the
// browser bundle.
//
// Runs through satori (via next/og's `ImageResponse`), not a browser — so the
// layout below is deliberately plainer than `scripts/generate-og.mjs`'s
// screenshot-rendered static cards: every multi-child `div` states
// `display: "flex"` explicitly (satori has no CSS default for it), there is no
// `mask-image` (the static card's track-lines fade uses one; a flex spacer
// does the same "leave room" job here without it), and every colour is a
// literal rather than a CSS variable, matching `generate-og.mjs`'s own stance
// that a rendered image has no theme or surrounding page to inherit from.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { protocolForSession, POSITION_NOUN, protocolIconSrc } from "@/lib/shared/protocols";
import { protocolGlyph, type Glyph } from "@/components/icons/protocol-glyphs";
import { CHAINS, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { monthShort } from "@/lib/date";

/** What a family's `share-card.ts` mapper hands the renderer — already the
 *  page's own numbers, in the page's own formatted strings. This file draws
 *  them; it does not compute or format anything about the position itself. */
export interface PositionCardModel {
  /** The explorer this position belongs to — which resolves the label, the
   *  chain word, the noun and the mark. */
  session?: SessionProtocol;
  /** A vault-layer identity, for a card whose subject is a vault rather than
   *  the explorer around it. When set it WINS over `session`: the label, the
   *  chain word and the mark all come from here, and the noun is "Position",
   *  which is what such a route is. */
  identity?: { label: string; chainId: ChainId; mark: "vaults" };
  /** The position's id/wallet, already shortened the way the page title
   *  shortens it (`shortSubject` for an address, the page's own truncation
   *  for a Liquity-family trove id). */
  subject: string;
  /** e.g. "ETH/BOLD" — Liquity-family cards only. */
  market?: string;
  /** The whole headline, for a card that is about a SET of positions rather
   *  than one. The composed `<market> <noun> <subject>` headline names ONE
   *  position — "CDP 0xedb7…2959" reads as a CDP whose id is that address, and
   *  a wallet card is not that. Such a card writes its own line ("CDPs held by
   *  0xedb7…2959") and the composition is skipped. */
  headline?: string;
  /** The position's lifecycle word in the page's own vocabulary ("Open",
   *  "Closed", "Liquidated", …). Omitted where the loader carries no such
   *  field (Moonwell Base's live Comptroller read has none). */
  status?: string;
  /** Up to three headline stats, in render order. A family mapper omits a
   *  stat its loader didn't carry rather than padding this with a placeholder. */
  stats: { label: string; value: string }[];
  /** When the read behind this card was taken — every position route here is
   *  `force-dynamic` + `no-store`, so "now" at render time is also "now" for
   *  the numbers being drawn. Stated on the card because a scraper caches the
   *  image: the stamp is the only way a viewer of the cached copy later knows
   *  how stale it might be. */
  asOf: Date;
}

// Exported — lib/share/event-card.tsx (the sibling event-card renderer) draws
// on the same canvas, muted tone and icon-on-dark fill rather than copying the
// literals, so the two cards can never quietly drift apart on palette.
export const CANVAS = "rgb(20 22 30)";
export const MUTED = "rgb(104 119 144)";
// No tile/surface sits behind the mark on this card (same stance as
// generate-og.mjs's ICON_ON_DARK) — a glyph painted `currentColor` in the app
// has no text colour to inherit here, so the fill is a literal near-white.
export const ICON_ON_DARK = "rgba(255, 255, 255, 0.92)";

const FONTS_DIR = path.join(process.cwd(), "lib/share/fonts");
const PUBLIC_DIR = path.join(process.cwd(), "public");

type LoadedFont = { name: string; data: Buffer; weight: 500 | 700; style: "normal" };

// Font bytes are read once per server lifetime and reused on every render —
// satori needs the raw bytes on each call, but re-reading two ~70KB files off
// disk per unfurl would be a needless syscall on a route scrapers hit often.
// Exported so the event card renderer shares this one cache rather than
// opening its own second copy of the same two files.
let fontsPromise: Promise<LoadedFont[]> | null = null;
export function loadFonts(): Promise<LoadedFont[]> {
  if (!fontsPromise) {
    fontsPromise = Promise.all([
      readFile(path.join(FONTS_DIR, "DMSans-Medium.ttf")),
      readFile(path.join(FONTS_DIR, "DMSans-Bold.ttf")),
    ]).then(([medium, bold]) => [
      { name: "DM Sans", data: medium, weight: 500 as const, style: "normal" as const },
      { name: "DM Sans", data: bold, weight: 700 as const, style: "normal" as const },
    ]);
  }
  return fontsPromise;
}

// The colour-PNG fallback for a protocol with no monochrome glyph yet — memoised
// per id since the same handful of ids repeat across every request this
// process serves. `null` (a missing file) is cached too, so a bad id doesn't
// retry the read on every render.
const iconDataUriCache = new Map<string, Promise<string | null>>();
function loadIconDataUri(id: string): Promise<string | null> {
  const cached = iconDataUriCache.get(id);
  if (cached) return cached;
  const promise = (async () => {
    try {
      const rel = protocolIconSrc(id).replace(/^\//, "");
      const bytes = await readFile(path.join(PUBLIC_DIR, rel));
      return `data:image/png;base64,${bytes.toString("base64")}`;
    } catch (err) {
      console.error(`share-image: no colour icon on disk for protocol id "${id}"`, err);
      return null;
    }
  })();
  iconDataUriCache.set(id, promise);
  return promise;
}

/** A scale-about-centre matrix for `Glyph.inset`, in viewBox space. Mirrors
 *  the identical private helper in `protocol-glyphs.tsx`'s `ProtocolGlyph`
 *  and `generate-og.mjs`'s `insetTransform` — three renderers draw the same
 *  glyph data into three different targets (DOM, a screenshot, satori), so
 *  each keeps its own copy of the one arithmetic they all need. */
function insetTransform(viewBox: string, inset: number): string {
  const [minX, minY, width, height] = viewBox.split(/\s+/).map(Number);
  const cx = minX + width / 2;
  const cy = minY + height / 2;
  const scale = 1 - inset;
  return `translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})`;
}

function glyphGeometry(glyph: Glyph) {
  const paths = (glyph.paths ?? []).map((p, i) => (
    <path key={`p${i}`} d={p.d} fillRule={p.fillRule} opacity={p.opacity} />
  ));
  const rects = (glyph.rects ?? []).map((r, i) => (
    <rect key={`r${i}`} x={r.x ?? 0} y={r.y ?? 0} width={r.width} height={r.height} />
  ));
  const geometry = [...paths, ...rects];
  const drawn = glyph.transform ? <g transform={glyph.transform}>{geometry}</g> : geometry;
  return glyph.inset ? <g transform={insetTransform(glyph.viewBox, glyph.inset)}>{drawn}</g> : drawn;
}

/** The protocol mark, glyph-or-PNG — the same fallback rule `ProtocolIcon`
 *  applies in-app, drawn with an explicit fill since satori has no
 *  `currentColor` text context to inherit from. `null` when neither exists
 *  (an id the roster doesn't carry an icon for at all), in which case the
 *  header simply renders without a mark rather than a broken image. Exported
 *  for the event card renderer, which draws the same header-left mark. */
export async function protocolMark(id: string, size: number) {
  const glyph = protocolGlyph(id);
  if (glyph) {
    return (
      <svg width={size} height={size} viewBox={glyph.viewBox} fill={ICON_ON_DARK} xmlns="http://www.w3.org/2000/svg">
        {glyphGeometry(glyph)}
      </svg>
    );
  }
  const dataUri = await loadIconDataUri(id);
  if (!dataUri) return null;
  // eslint-disable-next-line @next/next/no-img-element -- satori draws from a
  // real <img>, not next/image (which it cannot run through).
  return <img src={dataUri} width={size} height={size} style={{ borderRadius: Math.round(size * 0.09) }} />;
}

/** "2 Sep 2026 09:15 UTC" — day-month-year so it reads the same regardless of
 *  the viewer's locale, and UTC stated explicitly since the number itself is
 *  the point (see `PositionCardModel.asOf`). Built by hand rather than with
 *  `toLocaleString`: Intl's day/month/year ORDER varies by locale, and this
 *  card has no locale of its own to key off. */
function formatAsOf(d: Date): string {
  const day = d.getUTCDate();
  const month = monthShort(d.getUTCMonth());
  const year = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `as of ${day} ${month} ${year} ${hh}:${mm} UTC`;
}

/** The Vaults SECTION's mark, drawn for satori.
 *
 *  The section carries the Lucide "vault" glyph in the app
 *  (components/vaults/vaults-identity.tsx) and has no PNG under
 *  /icons/protocols and no entry in `protocolGlyph`, because it is not a
 *  protocol. The geometry is transcribed here — lucide-react 0.541's own path
 *  data — with `stroke`/`fill` as LITERALS rather than `currentColor`: satori
 *  has no text colour to inherit, so an unstated stroke would draw nothing.
 *  The four small dial circles are FILLED (they are `r=.5` dots in the source,
 *  which a stroke alone would render as four hollow rings at this size). */
function vaultsMark(size: number) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={ICON_ON_DARK}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width={18} height={18} x={3} y={3} rx={2} />
      <circle cx={7.5} cy={7.5} r={0.5} fill={ICON_ON_DARK} />
      <path d="m7.9 7.9 2.7 2.7" />
      <circle cx={16.5} cy={7.5} r={0.5} fill={ICON_ON_DARK} />
      <path d="m13.4 10.6 2.7-2.7" />
      <circle cx={7.5} cy={16.5} r={0.5} fill={ICON_ON_DARK} />
      <path d="m7.9 16.1 2.7-2.7" />
      <circle cx={16.5} cy={16.5} r={0.5} fill={ICON_ON_DARK} />
      <path d="m13.4 13.4 2.7 2.7" />
      <circle cx={12} cy={12} r={2} />
    </svg>
  );
}

/** Renders one position's share card. Never throws for a data reason — a
 *  model with an empty `stats` array still renders a card with just the
 *  header and subject line — but a font/icon read that fails IS allowed to
 *  throw here; `lib/share/position-image.ts` is the layer that turns any
 *  throw into the static roster-card fallback, so this function lets the
 *  failure surface rather than silently drawing a broken card. */
export async function renderPositionCard(model: PositionCardModel): Promise<ImageResponse> {
  // A SECTION states its own identity and never touches the roster; an
  // explorer resolves its own from it. One or the other, never a blend.
  const entry = model.identity ? undefined : model.session ? protocolForSession(model.session) : undefined;
  const chainId = model.identity ? model.identity.chainId : entry?.chainId;
  const label = model.identity ? model.identity.label : (entry?.label ?? "Rails");
  // The chain rides as small lettering after the bare label ("Moonwell" then
  // "on Base" at a third of the size), a decision Miles made on the benchmark
  // over the in-app ChainMark square: at feed size the square read as an
  // unexplained blue block, and the words say it. Ethereum stays unsaid, as
  // everywhere else.
  const chainWord = chainId != null && chainId !== MAINNET_CHAIN_ID ? `on ${CHAINS[chainId].name}` : null;
  const noun = model.identity ? "Position" : model.session ? POSITION_NOUN[model.session] : "Position";
  const headline = model.headline ?? [model.market, noun, model.subject].filter(Boolean).join(" ");
  // The headline is ONE line — `whiteSpace: "nowrap"` — because a wrapped
  // headline pushes the stats off the canvas. A vault's share symbol is a
  // longer market word than a collateral pair ("stkwaEthUSDC.v1" against
  // "ETH/BOLD"), and at 64px a 36-character headline runs past the right edge,
  // so the type steps down instead of the line breaking. The two thresholds are
  // measured against this canvas's 1060px of content width at DM Sans Bold:
  // 64px overflows past ~32 characters and 48px past ~44.
  const headlineSize = headline.length > 44 ? 40 : headline.length > 32 ? 48 : 64;

  const [fonts, mark] = await Promise.all([
    loadFonts(),
    model.identity ? Promise.resolve(vaultsMark(64)) : entry ? protocolMark(entry.id, 64) : Promise.resolve(null),
  ]);

  const jsx = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: CANVAS,
        color: "#fff",
        fontFamily: "DM Sans",
        padding: "56px 70px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {mark && <div style={{ display: "flex", width: 64, height: 64 }}>{mark}</div>}
          <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: "0.01em" }}>{label}</span>
          {chainWord && <span style={{ fontSize: 22, fontWeight: 500, color: MUTED, marginTop: 6 }}>{chainWord}</span>}
        </div>
        {/* The Rails mark, top-right — the same three-stroke geometry
            scripts/generate-og.mjs's static cards draw, so the live card and
            the static fallback carry one brand. The address goes bottom-right
            instead, where a reader looks last for where to go. */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width={44} height={44} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              fill="#fff"
              fillOpacity={0.85}
              d="M 79.763 159.671 L 111.637 159.671 L 52.168 41.625 L 20.295 41.625 L 79.763 159.671 Z"
            />
            <path
              fill="#fff"
              fillOpacity={0.85}
              d="M 98.578 97.056 L 130.451 97.056 L 105.044 47.853 L 73.171 47.853 L 98.578 97.056 Z"
            />
            <path
              fill="#fff"
              d="M 148.892 142.388 L 180.766 142.388 L 155.359 93.185 L 123.486 93.185 L 148.892 142.388 Z"
            />
          </svg>
          <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: "0.025em" }}>Rails</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 36 }}>
        <span style={{ fontSize: headlineSize, fontWeight: 700, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>
          {headline}
        </span>
        {model.status && (
          <span
            style={{
              display: "flex",
              marginTop: 16,
              padding: "6px 16px",
              border: `1px solid ${MUTED}`,
              borderRadius: 999,
              fontSize: 24,
              fontWeight: 500,
              color: MUTED,
              alignSelf: "flex-start",
            }}
          >
            {model.status}
          </span>
        )}
      </div>

      {model.stats.length > 0 && (
        // `flexWrap` rather than a fixed width: a large position's numbers
        // (a multi-million BOLD debt, say) can outgrow three columns at 64px
        // apart, and wrapping the overflow stat onto its own line keeps every
        // figure inside the canvas instead of running off the right edge.
        <div style={{ display: "flex", flexWrap: "wrap", width: "100%", marginTop: 36, gap: 48, rowGap: 16 }}>
          {model.stats.map((s) => (
            <div key={s.label} style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 22, fontWeight: 500, color: MUTED }}>{s.label}</span>
              <span style={{ fontSize: 44, fontWeight: 700, marginTop: 4 }}>{s.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Pushes the footer to the bottom of the content box regardless of how
          many stats rendered above, the same job the static card's absolutely-
          positioned footer does with a taller canvas to work with. A small
          floor on the spacer keeps a minimum breathing gap above the footer
          even in the tightest case (stats wrapped to two rows) without
          pushing the total content past the 630px canvas — sized against
          that worst case, not added on top of the common one. */}
      <div style={{ display: "flex", flexGrow: 1, minHeight: 12 }} />

      {/* No foundation sentence on the live card (Miles, on the benchmark):
          the numbers are the card, and the stamp is the one line of small
          print that earns its place — a scraper caches this image, so the
          stamp is how a later viewer knows how stale it may be. */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <span style={{ display: "flex", fontSize: 22, color: MUTED, whiteSpace: "nowrap" }}>
          {formatAsOf(model.asOf)}
        </span>
        <span style={{ display: "flex", fontSize: 28, fontWeight: 500, color: MUTED }}>rails.finance</span>
      </div>
    </div>
  );

  return new ImageResponse(jsx, { width: 1200, height: 630, fonts });
}
