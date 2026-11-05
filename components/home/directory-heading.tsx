// The home directory's heading (S10, ui-jobs 507): "Protocols with Rails
// Explorers" at the home sections' heading size, "Protocols" in the marketing
// blue, on the column's left edge over the chain switch.

export function DirectoryHeading() {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-8" data-anatomy="S10">
      <h2 className="text-3xl font-semibold tracking-tight text-foreground" data-home-directory-heading="">
        <span className="marketing">Protocols</span> with Rails Explorers
      </h2>
    </div>
  );
}
