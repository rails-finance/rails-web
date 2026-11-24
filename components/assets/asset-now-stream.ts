// The streamed part of a protocol's asset page (ui-jobs 829): the page draws
// its chart panel and source row at once and streams the parts fed by the
// price-now read (the panel header's price, the oracle table, the as-of line)
// when the read answers. The page starts the read once and hands the one
// promise to every boundary, so the figures cannot disagree.
//
// Written with createElement, not JSX, so the unit test renders it under node
// with React's server renderer (scripts/test/asset-now-stream.test.mjs).

import { createElement, Fragment, Suspense, use, type ReactNode } from "react";

/** One boundary over a read: `pending` until `read` settles, then `children(value)`. */
export function NowStream<T>({
  read,
  pending,
  children,
}: {
  read: Promise<T>;
  pending: ReactNode;
  children: (value: T) => ReactNode;
}): ReactNode {
  return createElement(
    Suspense,
    { fallback: pending },
    createElement(Settled as (p: { read: Promise<T>; render: (value: T) => ReactNode }) => ReactNode, {
      read,
      render: children,
    }),
  );
}

function Settled<T>({ read, render }: { read: Promise<T>; render: (value: T) => ReactNode }): ReactNode {
  return render(use(read));
}

/** The chain section's body (A2): the chart panel and the source row drawn at
 *  once, then the table and the as-of line under one boundary on `read`. */
export function AssetSectionBody<T>({
  chart,
  source,
  read,
  pending,
  priced,
}: {
  chart: ReactNode;
  source: ReactNode;
  read: Promise<T>;
  pending: ReactNode;
  priced: (value: T) => ReactNode;
}): ReactNode {
  return createElement(Fragment, null, chart, source, NowStream({ read, pending, children: priced }));
}
