import type { Metadata } from "next";
import { ExportReceiptView } from "./receipt-view";

// The link a queued CSV export hands the reader (rails-ops decision 0029). It
// shows the job while the file is prepared and the download once it is ready,
// for 24 hours, whether or not the page that requested it is still open.

export const metadata: Metadata = {
  title: "Export",
  robots: { index: false, follow: false },
};

export default async function ExportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { id } = await params;
  const { token } = await searchParams;
  return (
    <div className="container mx-auto md:px-6 px-4 pt-32 pb-12 max-w-md">
      <div
        className="rounded-2xl p-6 shadow-xl border border-rb-200 dark:border-rb-800"
        style={{ background: "var(--surface-overlay)" }}
      >
        <ExportReceiptView id={id} token={typeof token === "string" ? token : ""} />
      </div>
    </div>
  );
}
