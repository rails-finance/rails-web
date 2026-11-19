// The release-stage pill (H25, ui-jobs 769): an outlined "Beta" that is part
// of the Rails home link, under the mark on the rail from 768px (H1) and to
// its right in the phone header bar below it (H2); alone at the header's
// centre on home, where the hero carries the mark. A label: it opens nothing
// and takes no tab stop of its own.

export function BetaPill({ placement }: { placement: "rail" | "header" }) {
  return (
    <span
      className="rounded-full border border-rb-300 px-1.5 text-[9px] font-semibold uppercase leading-[14px] tracking-wider text-rb-500 dark:border-rb-500"
      data-beta-pill={placement}
      data-anatomy="H25"
    >
      Beta
    </span>
  );
}
