// A group row's count (rails-ops TO-DO-ui-jobs 331, point 3): a small chip
// after the kind word in T1, and after the word in the phone caption, the
// count in bold on the marker fill, a step smaller than the word. The row's name and the ⋮ words carry the
// count in words ("48 grouped events"), so the chip is hidden from assistive
// technology. `data-group-count` carries the number for the verifiers;
// `data-prov-exempt`: a row count, the "event numbers" class.

export function CountChip({ count }: { count: number }) {
  return (
    <span
      aria-hidden="true"
      data-prov-exempt=""
      data-group-count={count}
      className="ml-1.5 inline-flex items-center self-center rounded bg-marker px-1.5 py-0.5 align-middle text-[0.86em] font-bold leading-none text-foreground"
    >
      {count.toLocaleString("en-US")}
    </span>
  );
}
