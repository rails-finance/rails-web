// The replay proxy's pins file (rpc-counting-proxy.mjs; rails-ops TO-DO-ui-jobs.md item 686).
// A proxy merges its pins into the file: it re-reads the file just before writing, the file's
// keys win, it writes only when it holds a pin the file lacks, never an empty set, and through
// a temp file renamed over the old one.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** The file's pins, or {} where it is missing or unreadable. */
export function readPinsFile(file) {
  try {
    const got = JSON.parse(readFileSync(file, "utf8"));
    return got && typeof got === "object" && !Array.isArray(got) ? got : {};
  } catch {
    return {};
  }
}

/** Merge `pins` into `file`; true where the file was written. */
export function writePinsFile(file, pins) {
  const onDisk = readPinsFile(file);
  if (!Object.keys(pins).some((k) => !(k in onDisk))) return false;
  const merged = { ...pins, ...onDisk };
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(merged, null, 2));
  renameSync(tmp, file);
  return true;
}
