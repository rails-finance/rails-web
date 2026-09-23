// The one shared EVENT-card renderer — sibling to `position-card.tsx`. Every
// family's `event/[eventId]/opengraph-image.tsx` ends up here with a small,
// already-formatted model, and this file turns that model into the 1200×630
// PNG.
// ----------------------------------------------------------------------------
// SERVER-ONLY, same reasons as `position-card.tsx`: it reads font/icon bytes
// off disk with `fs` and must never reach the browser bundle. Same satori
// constraints too (explicit `display: "flex"` on every multi-child div, every
// colour a literal) — see that file's header for the fuller rationale, which
// this file does not restate.
//
// The one difference of substance from the position card is the subject: an
// EVENT is immutable, so there is no "as of" stamp here — the position card's
// stamp exists because a scraper's cached copy of a LIVE position can go
// stale; a decoded on-chain event never does.

import { ImageResponse } from "next/og";
import { protocolForSession, POSITION_NOUN } from "@/lib/shared/protocols";
import { CHAINS, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { CANVAS, MUTED, loadFonts, protocolMark } from "@/lib/share/position-card";

/** What `lib/share/event-model.ts`'s family-agnostic mapper hands the
 *  renderer — already the flows this event carries, in already-formatted
 *  strings. This file draws them; it computes nothing about the event itself. */
export interface EventCardModel {
  session: SessionProtocol;
  /** The position's id/wallet, already shortened the way the position card's
   *  own subject is (`shortSubject`). */
  subject: string;
  /** e.g. "ETH/BOLD" — Liquity-family cards only. */
  market?: string;
  /** The verb — the biggest thing on the card ("Supply", "Redeemed", …). */
  actionLabel: string;
  /** Up to three flows, the largest by |valueUsd| when any flow carries one,
   *  else the first three in the event's own order. */
  flows: { sign: "+" | "−"; amount: string; symbol: string }[];
  /** The summed |valueUsd| of the shown flows, formatted like the position
   *  card's stats — omitted when none of the shown flows carry a price. */
  usd?: string;
  at: Date;
  txHash: string;
  blockNumber: number;
}

/** "2 Sep 2026 09:15 UTC" — day-month-year so it reads the same regardless of
 *  the viewer's locale. Mirrors `position-card.tsx`'s `formatAsOf`, minus the
 *  "as of " prefix: an event's timestamp is simply WHEN it happened, not a
 *  staleness disclosure. Built by hand for the same reason that file's does —
 *  Intl's day/month/year order varies by locale and this card has none. */
function formatEventStamp(d: Date): string {
  const day = d.getUTCDate();
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const year = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${year} ${hh}:${mm} UTC`;
}

/** Renders one event's share card. Never throws for a data reason — a model
 *  with an empty `flows` array still renders a card with just the header and
 *  the verb — but a font/icon read that fails IS allowed to throw here;
 *  `lib/share/event-image.ts` is the layer that turns any throw into the
 *  explorer's static fallback card. */
export async function renderEventCard(model: EventCardModel): Promise<ImageResponse> {
  const entry = protocolForSession(model.session);
  const label = entry?.label ?? "Rails";
  // Same stance as the position card: the chain rides as small lettering
  // after the bare label, Ethereum stays unsaid.
  const chainWord = entry && entry.chainId !== MAINNET_CHAIN_ID ? `on ${CHAINS[entry.chainId].name}` : null;
  const noun = POSITION_NOUN[model.session];
  // The position this event belongs to, subordinate to the verb below —
  // carries `market`/`subject` from the model onto the card the same way the
  // position card's own headline does, just demoted to a subtitle since the
  // ACT is the biggest thing here, not the position.
  const subtitle = [label, model.market, noun, model.subject].filter(Boolean).join(" ");

  const [fonts, mark] = await Promise.all([loadFonts(), entry ? protocolMark(entry.id, 64) : Promise.resolve(null)]);

  const txSnippet = `tx ${model.txHash.slice(0, 10)}…`;

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
        {/* The Rails mark, top-right — identical geometry to the position
            card's (and the static fallback's), so every card the site emits
            carries one brand. */}
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

      {/* The verb — the biggest thing on the card (social register: the ACT,
          not the position it happened to). */}
      <div style={{ display: "flex", flexDirection: "column", marginTop: 36 }}>
        <span style={{ fontSize: 64, fontWeight: 700, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>
          {model.actionLabel}
        </span>
        <span style={{ display: "flex", fontSize: 26, fontWeight: 500, color: MUTED, marginTop: 10 }}>{subtitle}</span>
      </div>

      {model.flows.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", width: "100%", marginTop: 36, gap: 48, rowGap: 16 }}>
          {model.flows.map((f, i) => (
            // Keyed by position rather than symbol — a liquidation can carry
            // two flows of the same symbol on opposite legs (rare, but the
            // list is `flows[]` not a symbol-keyed map).
            // eslint-disable-next-line react/no-array-index-key
            <span
              key={i}
              style={{ display: "flex", fontSize: 44, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
            >
              {/* A dust amount reads "<0.01"; a space keeps its sign from
                  running into the "<" ("+ <0.01", not "+<0.01"). */}
              {f.amount.startsWith("<") ? `${f.sign} ${f.amount}` : `${f.sign}${f.amount}`} {f.symbol}
            </span>
          ))}
        </div>
      )}
      {model.usd && (
        <span style={{ display: "flex", fontSize: 24, fontWeight: 500, color: MUTED, marginTop: 12 }}>
          ≈ {model.usd} moved
        </span>
      )}

      <div style={{ display: "flex", flexGrow: 1, minHeight: 12 }} />

      {/* No "as of" stamp — see the file header: an event is immutable, so
          there is nothing for a stamp to disclose staleness about. */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <span style={{ display: "flex", fontSize: 22, color: MUTED, whiteSpace: "nowrap" }}>
          {formatEventStamp(model.at)} · block {model.blockNumber.toLocaleString("en-US")}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ display: "flex", fontSize: 22, color: MUTED }}>{txSnippet}</span>
          <span style={{ display: "flex", fontSize: 28, fontWeight: 500, color: MUTED }}>rails.finance</span>
        </div>
      </div>
    </div>
  );

  return new ImageResponse(jsx, { width: 1200, height: 630, fonts });
}
