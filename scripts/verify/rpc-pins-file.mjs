// The replay proxy's pins file (rpc-counting-proxy.mjs; rails-ops TO-DO-ui-jobs.md item 686).
// A proxy merges the pins its run took into the file: it re-reads the file just before writing,
// the file's keys win, it writes only when it took a pin the file lacks, never an empty set,
// never over a file it cannot read, and through a temp file renamed over the old one.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** The file's pins: {} where it is missing, null where it cannot be read as a set of pins. */
export function readPinsFile(file) {
  if (!existsSync(file)) return {};
  try {
    const got = JSON.parse(readFileSync(file, "utf8"));
    return got && typeof got === "object" && !Array.isArray(got) ? got : null;
  } catch {
    return null;
  }
}

/** Merge the pins a run took into `file`: "written", "unchanged" (no pin the file lacks), or
 *  "unreadable" (the file is left alone). */
export function writePinsFile(file, taken) {
  const onDisk = readPinsFile(file);
  if (!onDisk) return "unreadable";
  if (!Object.keys(taken).some((k) => !(k in onDisk))) return "unchanged";
  const merged = { ...taken, ...onDisk };
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(merged, null, 2));
  renameSync(tmp, file);
  return "written";
}
