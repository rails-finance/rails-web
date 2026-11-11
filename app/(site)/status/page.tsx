import { fetchIndexProgress, fetchIndexStatus } from "@/lib/api/fetch-index";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { StatusBoard, type StatusSource } from "@/components/status/status-board";

// focus: Rails' own indexing status, a page about Rails itself.

// The public status page (rails-ops ui-jobs 583, decision 0064 point 4): how
// far each protocol's index has read, by chain, from rails-server's stored
// progress. A visit reads no chain.

export const metadata = listingMetadata({
  title: "Status",
  canonicalPath: "/status",
  description: "How far Rails has read each protocol's history, chain by chain, and when each index last reported.",
});

export const revalidate = 60;

export default async function StatusPage() {
  // /status covers every explorer; a server without it answers 404, and the
  // page falls back to /progress (the fill only).
  const status = await fetchIndexStatus();
  const progress = status.kind === "ok" ? null : await fetchIndexProgress();
  const source: StatusSource | null =
    status.kind === "ok"
      ? { route: "status", data: status.data }
      : progress?.kind === "ok"
        ? { route: "progress", data: progress.data }
        : null;
  return (
    <div className="container mx-auto md:px-6 px-4 pt-32 pb-16 max-w-4xl">
      <h1 className="font-sans font-semibold tracking-tight text-foreground text-[clamp(28px,4vw,40px)]">Status</h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-rb-500">
        Rails reads every protocol&apos;s history from its deployment block. This page shows how far each index has
        read, chain by chain, and when each last reported.
      </p>
      {source ? (
        <StatusBoard source={source} />
      ) : (
        <p className="mt-10 rounded-xl bg-raised p-4 text-sm text-rb-500">
          The index server did not answer. Its figures show here when it does.
        </p>
      )}
    </div>
  );
}
