// The home directory's heading (S10, ui-jobs 507): "Destination DeFi" at
// display size, a share of the column's width (cqw) so the line spans it, on
// the column's left edge. "Destination" in the muted body tone, "DeFi" in the
// marketing blue. Under it, the muted line on how to use the directory.

export function DirectoryHeading() {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-8 @container" data-anatomy="S10">
      <h2
        className="whitespace-nowrap font-semibold leading-none tracking-tighter text-rb-500 text-[14cqw]"
        data-home-directory-heading=""
      >
        Destination <span className="marketing">DeFi</span>
      </h2>
      <p className="mt-4 text-lg text-rb-500" data-home-directory-intro="">
        Choose a chain, then select a protocol.
      </p>
    </div>
  );
}
