// Shared formatters for the per-protocol position → Markdown serializers
// (lib/<proto>/position-to-markdown.ts). Numbers are emitted at full precision
// (no compact "60K" notation) because an LLM reasons better over exact values
// than over rounded display strings.

export function num(n: number, maxDecimals = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: maxDecimals });
}

export function amt(n: number): string {
  return num(n, 6);
}

export function usd(n: number): string {
  return "$" + num(n, 2);
}

/** "2026-06-21 06:53 UTC" — unambiguous for an LLM reader. */
export function fmtUtc(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const pad = (x: number) => String(x).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
  );
}

/** A linked short tx hash for the timeline table. */
export function txCell(e: { txHash: string; etherscanUrl?: string }): string {
  const short = e.txHash.slice(0, 10) + "…";
  return e.etherscanUrl ? `[${short}](${e.etherscanUrl})` : short;
}
