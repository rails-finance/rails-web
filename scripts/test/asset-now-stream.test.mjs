// The asset page's first chunk carries the chart while the price-now read is
// held back (ui-jobs 829): components/assets/asset-now-stream.ts, rendered by
// React's server renderer with a read the test holds unresolved. The page
// hands the layout its chart panel (whose header streams on the same read)
// and its source row; the stand-ins here carry the real hooks, inside the
// section element the page draws them in (a bare fragment at the root holds
// React's first flush). Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { createElement as h, Fragment } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { AssetSectionBody, NowStream } from "../../components/assets/asset-now-stream.ts";

/** Renders `node`, answering the first chunk written and the whole document
 *  once the stream ends. */
function render(node) {
  let text = "";
  let shellResolve;
  let endResolve;
  const shell = new Promise((r) => (shellResolve = r));
  const done = new Promise((r) => (endResolve = r));
  const sink = new Writable({
    write(chunk, _enc, cb) {
      if (!text) shellResolve(chunk.toString());
      text += chunk.toString();
      cb();
    },
    final(cb) {
      endResolve(text);
      cb();
    },
  });
  const stream = renderToPipeableStream(node, {
    onShellReady() {
      stream.pipe(sink);
    },
    onShellError: (e) => {
      throw e;
    },
  });
  return { shell, done };
}

test("the first chunk carries the chart and the placeholders; the price lands when the read answers", async () => {
  let answer;
  const read = new Promise((r) => (answer = r));
  const head = read.then((now) => ({ price: `$${now.price}` }));
  const chart = h(
    "div",
    { "data-asset-chart": "lightweight" },
    h(NowStream, {
      read: head,
      pending: h("span", { "data-asset-head-pending": "" }),
      children: (hp) => h("span", { "data-asset-head-price": "" }, hp.price),
    }),
    h("div", { "data-asset-lw-box": "" }),
  );
  const { shell, done } = render(
    h(
      "section",
      { "data-asset-chain": 1 },
      h(AssetSectionBody, {
        chart,
        source: h("div", { "data-asset-source-row": "" }),
        read,
        pending: h(
          Fragment,
          null,
          h("section", { "data-asset-oracles-pending": "" }),
          h("p", { "data-asset-as-of-pending": "" }),
        ),
        priced: (now) =>
          h(
            Fragment,
            null,
            h("section", { "data-asset-oracles": "" }, h("td", { "data-asset-price-now": now.price }, `$${now.price}`)),
            h("p", { "data-asset-as-of": now.block }, `block ${now.block}`),
          ),
      }),
    ),
  );

  const first = await shell;
  assert.match(first, /data-asset-chart="lightweight"/, "the chart is in the first chunk");
  assert.match(first, /data-asset-source-row/, "the source row is in the first chunk");
  assert.match(first, /data-asset-head-pending/, "the header's placeholder is in the first chunk");
  assert.match(first, /data-asset-oracles-pending/, "the table's placeholder is in the first chunk");
  assert.match(first, /data-asset-as-of-pending/, "the as-of placeholder is in the first chunk");
  assert.doesNotMatch(first, /data-asset-price-now|data-asset-head-price|\$3412\.18/, "no price before the read");

  answer({ price: "3412.18", block: 26483745 });
  const all = await done;
  assert.match(all, /data-asset-head-price="">\$3412\.18/, "the header's price streams in");
  assert.match(all, /data-asset-price-now="3412\.18"/, "the table's price streams in");
  assert.match(all, /data-asset-as-of="26483745"/, "the as-of line streams in");
});
