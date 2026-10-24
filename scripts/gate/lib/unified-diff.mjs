// A line diff (Myers' O(ND) algorithm) written as a unified diff with three
// lines of context. Returns the text and the number of changed lines.

/** The edit script between two line arrays: [op, line] with op " ", "-", "+". */
function editScript(a, b) {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const off = max;
  const v = new Int32Array(2 * max + 2);
  const trace = [];
  outer: for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= n && y >= m) break outer;
    }
  }
  // Walk the trace back from the end.
  const ops = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const vd = trace[d];
    const k = x - y;
    const prevK = k === -d || (k !== d && vd[off + k - 1] < vd[off + k + 1]) ? k + 1 : k - 1;
    const prevX = vd[off + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      x--;
      y--;
      ops.push([" ", a[x]]);
    }
    if (d > 0) {
      if (x === prevX) ops.push(["+", b[--y]]);
      else ops.push(["-", a[--x]]);
    }
  }
  return ops.reverse();
}

export function unifiedDiff(a, b, { fromLabel = "a", toLabel = "b", context = 3 } = {}) {
  const ops = editScript(a, b);
  const changed = ops.filter(([op]) => op !== " ").length;
  if (changed === 0) return { text: "", changed: 0 };
  const out = [`--- ${fromLabel}`, `+++ ${toLabel}`];
  // Line numbers per op.
  let ai = 1;
  let bi = 1;
  const rows = ops.map(([op, line]) => {
    const r = { op, line, ai, bi };
    if (op !== "+") ai++;
    if (op !== "-") bi++;
    return r;
  });
  let i = 0;
  while (i < rows.length) {
    if (rows[i].op === " ") {
      i++;
      continue;
    }
    let start = Math.max(0, i - context);
    let end = i;
    // Extend the hunk while the next change is within 2×context lines.
    for (;;) {
      while (end < rows.length && rows[end].op !== " ") end++;
      let next = end;
      while (next < rows.length && rows[next].op === " ") next++;
      if (next < rows.length && next - end <= 2 * context) end = next;
      else break;
    }
    const stop = Math.min(rows.length, end + context);
    const hunk = rows.slice(start, stop);
    const aLen = hunk.filter((r) => r.op !== "+").length;
    const bLen = hunk.filter((r) => r.op !== "-").length;
    out.push(`@@ -${hunk[0].ai},${aLen} +${hunk[0].bi},${bLen} @@`);
    for (const r of hunk) out.push(`${r.op}${r.line}`);
    i = stop;
  }
  return { text: out.join("\n") + "\n", changed };
}
