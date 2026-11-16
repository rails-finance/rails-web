// The replay proxy's pins file (scripts/verify/rpc-pins-file.mjs, rails-ops TO-DO-ui-jobs.md
// item 686): merged with the file's keys winning, written only for a pin the file lacks, never
// as {}, and a proxy on the shared default cache without RPC_PIN=keep never writes it.
// Offline: the proxy runs against a local stub upstream under a temp HOME.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writePinsFile } from "../verify/rpc-pins-file.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROXY = join(HERE, "..", "verify", "rpc-counting-proxy.mjs");

const tmp = () => mkdtempSync(join(tmpdir(), "rpc-pins-test-"));
const read = (f) => JSON.parse(readFileSync(f, "utf8"));

test("a pin the file lacks is merged in, and the file's keys win", () => {
  const dir = tmp();
  const file = join(dir, "pins.json");
  writeFileSync(file, JSON.stringify({ ethereum: "0x10" }));
  assert.equal(writePinsFile(file, { ethereum: "0x99", base: "0x20" }), true);
  assert.deepEqual(read(file), { ethereum: "0x10", base: "0x20" });
  assert.deepEqual(readdirSync(dir), ["pins.json"], "no temp file left behind");
  rmSync(dir, { recursive: true, force: true });
});

test("pins the file already holds write nothing", () => {
  const dir = tmp();
  const file = join(dir, "pins.json");
  writeFileSync(file, '{"ethereum":"0x10"}');
  assert.equal(writePinsFile(file, { ethereum: "0x99" }), false);
  assert.equal(readFileSync(file, "utf8"), '{"ethereum":"0x10"}');
  rmSync(dir, { recursive: true, force: true });
});

test("no pins never writes {}", () => {
  const dir = tmp();
  const file = join(dir, "pins.json");
  assert.equal(writePinsFile(file, {}), false);
  assert.equal(existsSync(file), false);
  writeFileSync(file, '{"base":"0x1"}');
  assert.equal(writePinsFile(file, {}), false);
  assert.deepEqual(read(file), { base: "0x1" });
  rmSync(dir, { recursive: true, force: true });
});

test("an edit made to the file while a proxy runs survives the proxy's write", () => {
  const dir = tmp();
  const file = join(dir, "pins.json");
  const held = { ethereum: "0x10" }; // what a proxy loaded at start
  writeFileSync(file, JSON.stringify({ ethereum: "0x11", arbitrum: "0x30" })); // edited since
  held.base = "0x20"; // the proxy then pins a chain
  assert.equal(writePinsFile(file, held), true);
  assert.deepEqual(read(file), { ethereum: "0x11", arbitrum: "0x30", base: "0x20" });
  rmSync(dir, { recursive: true, force: true });
});

/** Start the proxy with `env` on a stub upstream, take a pin, stop it; resolve when it exits. */
async function runProxy(env) {
  const stub = http.createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      const body = JSON.parse(b);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: "0x2a" }));
    });
  });
  await new Promise((r) => stub.listen(0, "127.0.0.1", r));
  const port = 19500 + Math.floor(Math.random() * 400);
  const proxy = spawn(process.execPath, [PROXY], {
    env: {
      PATH: process.env.PATH,
      PORT: String(port),
      RPC_QUIET: "1",
      UPSTREAM: `http://127.0.0.1:${stub.address().port}/k`,
      ...env,
    },
    stdio: "ignore",
  });
  const exited = new Promise((r) => proxy.on("exit", r));
  try {
    let up = false;
    for (let i = 0; i < 50 && !up; i++) {
      try {
        await fetch(`http://127.0.0.1:${port}/__pins`);
        up = true;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    assert.ok(up, "the proxy listened");
    const res = await fetch(`http://127.0.0.1:${port}/upstream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
    });
    assert.equal((await res.json()).result, "0x2a");
    proxy.kill("SIGTERM");
    await exited;
  } finally {
    proxy.kill("SIGKILL");
    stub.close();
  }
}

test("a proxy on the shared default cache without RPC_PIN=keep leaves pins.json alone", async () => {
  const home = tmp();
  const file = join(home, ".cache", "rails-web", "rpc-replay", "pins.json");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, '{"ethereum":"0x10"}');
  await runProxy({ HOME: home });
  assert.equal(readFileSync(file, "utf8"), '{"ethereum":"0x10"}');
  rmSync(home, { recursive: true, force: true });
});

test("a proxy on its own RPC_CACHE_DIR merges the pin it took", async () => {
  const home = tmp();
  const dir = join(home, "own");
  mkdirSync(dir);
  writeFileSync(join(dir, "pins.json"), '{"ethereum":"0x10"}');
  await runProxy({ HOME: home, RPC_CACHE_DIR: dir });
  assert.deepEqual(read(join(dir, "pins.json")), { ethereum: "0x10", upstream: "0x2a" });
  assert.equal(existsSync(join(home, ".cache")), false, "nothing written to the shared default");
  rmSync(home, { recursive: true, force: true });
});
