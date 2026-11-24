// Runs once when a server process starts, before it serves a request.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // A data: fetch loads Node's fetch with no network call, so the dispatcher
    // it installs stays the one for every origin but the api host's.
    await fetch("data:,").catch(() => undefined);
    const { installApiPool } = await import("./lib/api/api-pool");
    installApiPool(process.env.RAILS_API_URL);
  }
}
