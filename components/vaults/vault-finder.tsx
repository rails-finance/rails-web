// Find an address in this vault (V4, rails-ops ui-jobs 407; survey 2026-10-20
// §6): one form on every vault page, under "Where the assets are". A native GET
// form: it submits `?holder=` to the vault's own path, which sends the reader
// on (307) to the holder's page under the vault, `/<chain>/<protocol>/vaults/
// <vault>/<holder>` (decision 0028 point 2), where every outcome of the input
// is stated. It needs no JavaScript, so a submit made before React attaches is
// a navigation.

export function VaultFinder() {
  return (
    <section className="mb-6" data-anatomy="V4" data-skel-section="vault-lookup">
      <form method="get" className="flex max-w-xl flex-wrap items-center gap-2">
        <label htmlFor="vault-finder" className="w-full text-sm font-semibold text-foreground">
          Find an address in this vault
        </label>
        <input
          id="vault-finder"
          type="text"
          name="holder"
          placeholder="Address or ENS name"
          spellCheck={false}
          autoComplete="off"
          className="min-w-0 flex-1 rounded-lg bg-raised px-3 py-2 text-[13px] text-foreground placeholder:text-rb-500 focus-ring"
        />
        <button
          type="submit"
          className="rounded-lg bg-rb-200 px-3.5 py-2 text-[13px] font-medium text-foreground focus-ring dark:bg-rb-500/30"
        >
          Open
        </button>
      </form>
    </section>
  );
}
