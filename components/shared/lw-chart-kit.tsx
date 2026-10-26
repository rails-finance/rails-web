"use client";

// What every chart on TradingView's Lightweight Charts shares (rails-ops
// reference/asset-key-map.md, "The chart engine"): the library loaded by a
// dynamic import, client only, so it lands in no route's first-load bundle;
// the site's tokens read as canvas colours, again on a theme change; the time
// axis's UTC labels; and the attribution the licence asks for (Apache-2.0: the
// NOTICE word for word with a link, and the `attributionLogo` layout option
// on). The asset chart (components/assets/asset-lw-chart.tsx) and the
// Lifetime flows charts (components/shared/lifetime-flows-lw.tsx) take it.

import { useEffect, useState } from "react";
import type { Time } from "lightweight-charts";
import { monthShort } from "@/lib/date";

export type LwLib = typeof import("lightweight-charts");

/** The NOTICE file of tradingview/lightweight-charts at v5.2.1, word for word (its
 *  "(с)" is a Cyrillic es, U+0441, kept as the file has it). */
export const LW_NOTICE = "TradingView Lightweight Charts™ Copyright (с) 2025 TradingView, Inc.";
export const LW_NOTICE_URL = "https://www.tradingview.com/";

/** The NOTICE and its link, at the end of a chart's source line. */
export function LwNotice() {
  return (
    <span data-asset-lw-notice="">
      {LW_NOTICE}{" "}
      <a href={LW_NOTICE_URL} target="_blank" rel="noreferrer" className="hover:underline">
        {LW_NOTICE_URL}
      </a>
    </span>
  );
}

/** The library, once its chunk is in; null until then, and not fetched
 *  until `wanted` (a chart hidden until a reader opens it). */
export function useLwLib(wanted = true): LwLib | null {
  const [lib, setLib] = useState<LwLib | null>(null);
  useEffect(() => {
    if (!wanted) return;
    let on = true;
    import("lightweight-charts").then((m) => on && setLib(m)).catch(() => {});
    return () => {
      on = false;
    };
  }, [wanted]);
  return lib;
}

/** A site token as an rgba() string the canvas takes (the tokens are oklch in light mode). */
function tokenColor(probe: HTMLElement, ctx: CanvasRenderingContext2D, value: string, alpha = 1): string {
  probe.style.color = value;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = getComputedStyle(probe).color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgba(${r}, ${g}, ${b}, ${((a / 255) * alpha).toFixed(3)})`;
}

/** Each named token (a CSS colour or `var(--…)`, with an optional alpha) as a
 *  canvas colour, read under `el`, with `el`'s font. */
export type LwColors<K extends string> = Record<K, string> & { font: string };
function readColors<K extends string>(el: HTMLElement, spec: Record<K, readonly [string, number?]>): LwColors<K> {
  const probe = document.createElement("span");
  probe.style.display = "none";
  el.appendChild(probe);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const out = { font: getComputedStyle(el).fontFamily } as LwColors<K>;
  for (const k of Object.keys(spec) as K[]) {
    const [value, alpha] = spec[k];
    (out as Record<K, string>)[k] = tokenColor(probe, ctx, value, alpha);
  }
  probe.remove();
  return out;
}

/** The theme's colours for `spec` (a module constant), read again when the
 *  root's class changes (next-themes). */
export function useLwColors<K extends string>(
  ref: React.RefObject<HTMLElement | null>,
  spec: Record<K, readonly [string, number?]>,
): LwColors<K> | null {
  const [p, setP] = useState<LwColors<K> | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setP(readColors(el, spec));
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
    return () => mo.disconnect();
  }, [ref, spec]);
  return p;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** The time axis's labels, in UTC: "2026", "Oct", "25 Oct", "10:02". */
export function lwTickLabel(t: Time, type: number): string {
  const d = new Date((t as number) * 1000);
  if (type === 0) return String(d.getUTCFullYear());
  if (type === 1) return monthShort(d.getUTCMonth());
  if (type === 2) return `${d.getUTCDate()} ${monthShort(d.getUTCMonth())}`;
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
