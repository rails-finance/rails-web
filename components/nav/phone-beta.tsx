// The release-stage pill below md, in the footer beside the copyright (Miles,
// 5 Nov 2026): the phone header carries the mark and the controls alone. From
// md it is BrandRail's, at the rail's foot.

export function PhoneBeta() {
  return (
    <span
      className="rounded bg-caution-500 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white md:hidden"
      data-phone-beta=""
    >
      Beta
    </span>
  );
}
