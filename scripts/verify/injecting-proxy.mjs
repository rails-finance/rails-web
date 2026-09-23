// injecting-proxy — a rewriting HTTP proxy in front of the dev server, so a
// verifier can doctor an API response the SERVER reads.
// ----------------------------------------------------------------------------
// ⇒ WHY THIS EXISTS. Playwright's `page.route()` only sees requests the BROWSER
// makes. Since the detail-page SSR migration the browser makes none: the page
// seeds from the server (`initialEvents`) and the client effect returns early
// on `if (seeded)`. Every verifier that injected a doctored payload that way
// silently stopped injecting anything — it now drives the real response and
// asserts against data it never shaped. One of them noticed (it asserted its
// own interception fired); one did not, and failed downstream on a NaN.
//
// ⇒ WHY A PROXY WORKS. `ssrOrigin()` builds the server's own fetch origin from
// the INCOMING REQUEST'S HOST HEADER (lib/shared/listing-ssr.ts). Point the
// browser at this proxy and the app, rendering that page, fetches its own API
// back through the proxy. One injection point catches BOTH lanes — the SSR
// seed and any client-side fetch — which is also why it cannot rot the way
// `page.route()` did: it does not care which side made the request.
//
// This is not a verifier; run-all lists it as a SKIP, like rpc-counting-proxy.
//
//   const proxy = await startInjectingProxy({
//     target: "http://localhost:3000",
//     rewrite: (url, json) => (url.includes("/timeline") ? { ...json, rowCeiling } : null),
//   });
//   … drive the browser at proxy.origin …
//   assert(proxy.rewrites > 0, "the injection actually fired");
//   await proxy.close();
import http from "node:http";

/**
 * @param {object} opts
 * @param {string} opts.target      Origin to forward to, e.g. "http://localhost:3000".
 * @param {(url: string, json: any) => any|null} opts.rewrite
 *        Called for every JSON response. Return a replacement object to inject,
 *        or null/undefined to pass the response through untouched.
 * @param {number} [opts.port]      0 (default) lets the OS pick a free one.
 */
export async function startInjectingProxy({ target, rewrite, port = 0 }) {
  const upstream = new URL(target);
  let rewrites = 0;

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const headers = { ...req.headers };
      // The Host header is what the app turns back into its own fetch origin,
      // so it has to keep naming the PROXY — that is the whole mechanism.
      headers.host = req.headers.host;
      // Read bodies rather than guess at them: no gzip, no brotli.
      headers["accept-encoding"] = "identity";
      delete headers["content-length"];

      const body = Buffer.concat(chunks);
      if (body.length) headers["content-length"] = String(body.length);

      const proxied = http.request(
        {
          hostname: upstream.hostname,
          port: upstream.port || 80,
          path: req.url,
          method: req.method,
          headers,
        },
        (up) => {
          const out = [];
          up.on("data", (c) => out.push(c));
          up.on("end", () => {
            let payload = Buffer.concat(out);
            const type = up.headers["content-type"] ?? "";
            if (type.includes("application/json")) {
              try {
                const replacement = rewrite(req.url ?? "", JSON.parse(payload.toString("utf8")));
                if (replacement != null) {
                  payload = Buffer.from(JSON.stringify(replacement));
                  rewrites += 1;
                }
              } catch {
                // Not parseable, or the rule threw: forward what came back.
                // A verifier that needed the injection finds rewrites === 0
                // and says so, which is the outcome that must never be silent.
              }
            }
            // The body is buffered, so it is sent with a length and never
            // chunked. `transfer-encoding` MUST go with it: a response
            // carrying both is a protocol error, and undici rejects it with
            // HPE_UNEXPECTED_CONTENT_LENGTH — which surfaces as a bare "fetch
            // failed" on the app's own SSR read, i.e. a page that renders as
            // though the API were down.
            const outHeaders = { ...up.headers };
            delete outHeaders["content-encoding"];
            delete outHeaders["transfer-encoding"];
            delete outHeaders["content-length"];
            outHeaders["content-length"] = String(payload.length);
            res.writeHead(up.statusCode ?? 502, outHeaders);
            res.end(payload);
          });
        },
      );
      proxied.on("error", (e) => {
        res.writeHead(502, { "content-type": "text/plain" });
        res.end(`injecting-proxy: upstream error — ${e.message}`);
      });
      if (body.length) proxied.write(body);
      proxied.end();
    });
  });

  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  const bound = server.address();
  return {
    origin: `http://127.0.0.1:${bound.port}`,
    get rewrites() {
      return rewrites;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
