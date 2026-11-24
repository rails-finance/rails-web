// The api-host cap's priority lane (lib/wallet/api-hop.ts): a chain's requests
// after its first take a freed slot before any first request waiting, so a
// k-step chain waits in the queue once. The fetch is a stubbed delay.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..") + "/").href;
const { API_CONCURRENCY, apiSlot, createLimiter, inChain, inWalletRead, isPastReadDeadline } = await import(
  ROOT + "lib/wallet/api-hop.ts"
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = () => new Promise((r) => setImmediate(r));
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};

/** One stubbed api request of `ms`. */
const request = (ms) => apiSlot(() => sleep(ms));

/** A chain of `steps` requests, each after the last; resolves with its end time. */
async function chain(steps, ms, t0) {
  for (let i = 0; i < steps; i++) await request(ms);
  return Date.now() - t0;
}

/** 4 one-step requests, a 5-step chain, then 16 more, all in one wallet read;
 *  `lanes` runs each in a chain of its own (the wallet read's markers), else
 *  none has a marker and every request queues in the normal lane (FIFO). */
function burst(ms, lanes) {
  const t0 = Date.now();
  const wrap = lanes ? inChain : (fn) => fn();
  return inWalletRead(async () => {
    const before = Array.from({ length: 4 }, () => wrap(() => request(ms)));
    const long = wrap(() => chain(5, ms, t0));
    const after = Array.from({ length: 16 }, () => wrap(() => request(ms)));
    const [end] = await Promise.all([long, ...before, ...after]);
    return end;
  }, Date.now() + 10_000);
}

test("a 5-step chain among 20 one-step requests waits in the queue once", async () => {
  const D = 150;
  const lane = await burst(D, true);
  const fifo = await burst(D, false);
  // Its first step is request 5 at a cap of 4: one round's wait, then five
  // service times. The burst's requests all end together, so the first step's
  // slot passes on before its second step queues, which waits one round more;
  // each later step takes the next freed slot. Under FIFO each later step
  // queues behind the rest of the burst.
  const laneExpected = (1 + 1 + 5) * D;
  console.log(`lane ${lane} ms (expected about ${laneExpected}), FIFO ${fifo} ms, service ${D} ms`);
  assert.ok(lane < laneExpected + D / 2, `lane ${lane} ms against about ${laneExpected}`);
  assert.ok(lane < fifo - D, `lane ${lane} ms against FIFO ${fifo} ms`);
});

test("with the priority lane busy, every first step gets a slot while the deadline leaves room", async () => {
  const D = 20;
  const granted = [];
  const results = await inWalletRead(async () => {
    const chains = Array.from({ length: 6 }, () => inChain(() => chain(5, D, Date.now())));
    const firsts = Array.from({ length: 12 }, (_, i) =>
      inChain(() =>
        apiSlot(async () => {
          granted.push(i);
          await sleep(D);
        }),
      ),
    );
    return Promise.allSettled([...chains, ...firsts]);
  }, Date.now() + 5_000);
  const refused = results.filter((r) => r.status === "rejected");
  assert.deepEqual(
    refused.map((r) => String(r.reason)),
    [],
  );
  assert.deepEqual(
    [...granted].sort((a, b) => a - b),
    Array.from({ length: 12 }, (_, i) => i),
  );
});

/** Hold every slot of the cap until `release`; resolves once they are held. */
async function holdTheCap() {
  const gate = deferred();
  const held = Array.from({ length: API_CONCURRENCY }, () => apiSlot(() => gate.promise));
  await tick();
  return { release: () => gate.resolve(), done: Promise.all(held) };
}

/** A served chain: one request has had its slot. Returns `within`, which runs
 *  a function inside the chain. */
async function servedChain() {
  const ready = deferred();
  const go = deferred();
  const done = inChain(async () => {
    await apiSlot(async () => {});
    ready.resolve();
    return (await go.promise)();
  });
  await ready.promise;
  return (fn) => {
    go.resolve(fn);
    return done;
  };
}

test("a served chain's next request goes ahead of a first request waiting before it", async () => {
  const order = [];
  await inWalletRead(async () => {
    const within = await servedChain();
    const cap = await holdTheCap();
    const first = inChain(() => apiSlot(async () => order.push("first")));
    const later = within(() => apiSlot(async () => order.push("later")));
    cap.release();
    await Promise.all([cap.done, first, later]);
  });
  assert.deepEqual(order, ["later", "first"]);
});

test("a wallet read started after another ends starts with no served chain", async () => {
  // The first read serves a chain and ends.
  await inWalletRead(() =>
    inChain(async () => {
      await request(1);
      await request(1);
    }),
  );
  const order = [];
  await inWalletRead(async () => {
    const cap = await holdTheCap();
    const a = inChain(() => apiSlot(async () => order.push("a")));
    const b = inChain(() => apiSlot(async () => order.push("b")));
    const c = apiSlot(async () => order.push("unmarked"));
    cap.release();
    await Promise.all([cap.done, a, b, c]);
  });
  assert.deepEqual(order, ["a", "b", "unmarked"]);
});

test("apiSlot outside a wallet read takes no slot and sees no marker", async () => {
  const cap = await inWalletRead(() => holdTheCap());
  // An explorer render, while every slot is held: it runs at once, a chain's
  // second request included.
  let ran = 0;
  await inChain(async () => {
    await apiSlot(async () => ran++);
    await apiSlot(async () => ran++);
  });
  assert.equal(ran, 2);
  cap.release();
  await cap.done;
});

test("two wallet reads at once do not share markers", async () => {
  const order = [];
  await inWalletRead(async () => {
    const within = await servedChain();
    const cap = await holdTheCap();
    const x = inChain(() => apiSlot(async () => order.push("A first")));
    // A second read started inside the first read's served chain: its request
    // carries no marker and queues in the normal lane.
    const other = within(() => inWalletRead(() => apiSlot(async () => order.push("B first"))));
    await tick();
    const later = inChain(() => apiSlot(async () => order.push("A first, later")));
    cap.release();
    await Promise.all([cap.done, x, other, later]);
  });
  assert.deepEqual(order, ["A first", "B first", "A first, later"]);
});

test("a job waiting in either lane leaves it on abort, and the queue moves on", async () => {
  const limit = createLimiter(1);
  const gate = deferred();
  const order = [];
  const holder = limit(() => gate.promise);
  const quick = new AbortController();
  const urgent = new AbortController();
  const a = limit(async () => order.push("normal aborted"), quick.signal);
  const b = limit(async () => order.push("priority aborted"), urgent.signal, true);
  const c = limit(async () => order.push("normal"));
  const d = limit(async () => order.push("priority"), undefined, true);
  const refused = Promise.all([assert.rejects(a, { name: "AbortError" }), assert.rejects(b, { name: "AbortError" })]);
  quick.abort();
  urgent.abort();
  await refused;
  gate.resolve();
  await Promise.all([holder, c, d]);
  assert.deepEqual(order, ["priority", "normal"]);
  // Both lanes empty: the next job runs at once.
  let ran = false;
  limit(async () => (ran = true));
  await tick();
  assert.equal(ran, true);
});

test("a served chain's request past the deadline is refused when its turn comes", async () => {
  let called = false;
  const outcome = inWalletRead(async () => {
    const within = await servedChain();
    const cap = await holdTheCap();
    const later = within(() => apiSlot(async () => (called = true)));
    later.catch(() => {});
    await sleep(80);
    cap.release();
    await cap.done;
    return later;
  }, Date.now() + 40);
  await assert.rejects(outcome, (err) => isPastReadDeadline(err));
  assert.equal(called, false);
});
