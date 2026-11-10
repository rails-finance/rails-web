// A setting's figure in compact form (a reserve's configuration changes,
// anatomy M3.6): K, M or B with the fewest decimals that keep the value to two
// places, so a cap reads as set: "1.25M", "40M", "12.5M", "375K". Below 1,000,
// up to two decimals. Pure: no imports, so the unit tests run it under node.
// A position's figures keep `formatCompact` (lib/shared/format-compact.ts).

const UNITS: readonly (readonly [number, string])[] = [
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "K"],
];

const upTo2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function compactFigure(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  for (let i = 0; i < UNITS.length; i++) {
    const [size, suffix] = UNITS[i];
    if (abs < size) continue;
    const scaled = Math.round((abs / size) * 100) / 100;
    // 999,999 rounds to 1,000K: it reads as the next unit up.
    if (scaled >= 1000 && i > 0)
      return `${sign}${upTo2(Math.round((abs / UNITS[i - 1][0]) * 100) / 100)}${UNITS[i - 1][1]}`;
    return `${sign}${upTo2(scaled)}${suffix}`;
  }
  return `${sign}${upTo2(abs)}`;
}
