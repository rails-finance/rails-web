// The step mark — two observed levels joined by a dashed rise, as an HTML row
// rather than a chart.
// ----------------------------------------------------------------------------
// ⚠️ THE HEIGHTS ARE FIXED, NOT SCALED. The two levels sit at the same two
// edges of the row in every mark ever drawn — the top and bottom of its 28px
// height, which is the MarkPair cluster's own height (two 24px chips in a
// p-0.5 wrapper), so the header's two level lines land on the chips' top and
// bottom edges and the whole row reads on one vertical centre. The mark
// encodes DIRECTION and states the two values in type beside it — it is not
// a chart, and no reader should take the size of the rise for the size of the
// change. A step of 3.68× and a step of 1.01× draw identically apart from
// their labels.
//
// The dashes are the other half of the same statement: nothing was read
// between the two observations, so nothing is drawn between them. Round caps
// on a near-zero dash draw dots rather than a solid line — a solid line (or,
// worse, a curve through the gap) would be our interpolation wearing the
// chain's clothes.
//
// Neutral ink only — every stroke and the two level lines are `currentColor`,
// so the mark takes the tone of whatever text it sits in. No accent: nobody
// chose these two levels, so nothing here may read as good or bad.
//
// `aria-hidden`: the two values and their direction are already in the note's
// sentence, in words (the direction glyph beside the headline figure, and the
// figures themselves). The mark repeats them for the eye and adds nothing for
// a screen reader.

/** One end's level line and label, a column the width of its own label, in
 *  three rows: a 2px line slot at the top, the label, a 2px line slot at the
 *  bottom. The label always sits in the middle row, so the two ends' values
 *  share one horizontal axis whichever way the step goes (Miles, 2026-09-04);
 *  `lineFirst` fills the top slot with the line, otherwise the bottom one. */
function StepColumn({ value, lineFirst }: { value: string; lineFirst: boolean }) {
  const line = <span className="block h-0.5 w-full rounded-full bg-current" />;
  return (
    <span className="grid grid-rows-[2px_1fr_2px]">
      <span className="row-start-1">{lineFirst && line}</span>
      <span className="row-start-2 self-center px-0.5 text-xs leading-none tabular-nums">{value}</span>
      <span className="row-start-3">{!lineFirst && line}</span>
    </span>
  );
}

/** The fixed-width dotted diagonal between the two level lines' centres —
 *  y=1 (the top line's centre) and y=27 (the bottom line's), whichever end
 *  each is at for this direction. */
function StepDiagonal({ rising }: { rising: boolean }) {
  const [y1, y2] = rising ? [27, 1] : [1, 27];
  return (
    <svg width={28} height={28} viewBox="0 0 28 28" className="shrink-0" aria-hidden="true">
      <line
        x1={0}
        y1={y1}
        x2={28}
        y2={y2}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeDasharray="0.1 4"
        opacity={0.7}
      />
    </svg>
  );
}

export function StepMark({ from, to, format }: { from: number; to: number; format: (n: number) => string }) {
  const rising = to > from;
  return (
    // data-prov-exempt: the two labels are stat-shaped text the dev coverage
    // tripwire would otherwise flag. They are the mark's own annotation of
    // values the panel states with receipts (the before → after card), the
    // way InlineAssetCluster's "+N" chip is exempt — chrome, not a figure.
    <span
      data-note-step=""
      data-prov-exempt=""
      aria-hidden="true"
      className="inline-flex h-7 items-stretch text-rb-500"
    >
      <StepColumn value={format(from)} lineFirst={!rising} />
      <StepDiagonal rising={rising} />
      <StepColumn value={format(to)} lineFirst={rising} />
    </span>
  );
}
