// The literals of a provenance summary, and the head rule of check:receipts (ui-jobs 545). splitSummary (components/shared/provenance.tsx) cuts a
// receipt's head at the earliest " — ", " – " or ". ", so the text before that cut is the inspector's
// head label. A head is a name clause: a ": " in it that opens a clause ("Market move: the change in…")
// means the sentence meant to cut there, and the head runs into the body. A colon before a figure
// ("MCR: 110%"), an interpolation or a one-word value ("state before this event: running") stays.

export const SUMMARY_SEPS = [" — ", " – ", ". "];

/** splitSummary's head, on a source literal's text. Keep in step with provenance.tsx. */
export function summaryHead(s) {
  let cut = -1;
  for (const sep of SUMMARY_SEPS) {
    const i = s.indexOf(sep);
    if (i > 0 && (cut < 0 || i < cut)) cut = i;
  }
  return (cut < 0 ? s : s.slice(0, cut)).replace(/\.$/, "");
}

/** A template's `${…}` replaced by a placeholder (nested braces and template literals included) and
 *  white space collapsed; `at[i]` is the source index of the flat text's character i. */
export function flatten(s) {
  let text = "";
  const at = [];
  const put = (ch, i) => {
    if (/\s/.test(ch) && /\s$/.test(text)) return;
    text += /\s/.test(ch) ? " " : ch;
    at.push(i);
  };
  let i = 0;
  while (i < s.length) {
    if (s[i] === "\\") {
      put(s[i], i);
      if (i + 1 < s.length) put(s[i + 1], i + 1);
      i += 2;
      continue;
    }
    if (s[i] === "$" && s[i + 1] === "{") {
      let depth = 1;
      let j = i + 2;
      let quote = null;
      while (j < s.length && depth > 0) {
        const c = s[j];
        if (c === "\\") j++;
        else if (quote) {
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'" || c === "`") quote = c;
        else if (c === "{") depth++;
        else if (c === "}") depth--;
        j++;
      }
      put("X", i);
      i = j;
      continue;
    }
    put(s[i], i);
    i++;
  }
  return { text, at };
}

/** The source index in `text` of its head's clause-opening ": ", or -1 when the head is a name clause. */
export function headColonAt(text) {
  const flat = flatten(text);
  const head = summaryHead(flat.text);
  let depth = 0;
  for (let i = 0; i < head.length; i++) {
    const c = head[i];
    if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (c === ":" && depth === 0 && /^ [a-z]/.test(head.slice(i + 1, i + 3)) && head.slice(i + 2).includes(" "))
      return flat.at[i];
  }
  return -1;
}

/** The head of `text` when it breaks the head rule, or null. */
export function headColon(text) {
  return headColonAt(text) < 0 ? null : summaryHead(flatten(text).text);
}

/** The literal texts of the expression starting at `from`: one entry per run of
 *  string/template literals joined by `+`, each marked `lead` when it starts the
 *  summary. Stops at the `,` `;` or closer that
 *  ends the expression. A template's `\${…}` stays in the text as written. */
export function literalRuns(src, from) {
  const runs = [];
  let cur = null; // the run being joined, or null after any non-`+` token
  let depth = 0;
  let prev = null; // the last character outside a literal that is not white space
  let i = from;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      let nest = 0;
      while (j < src.length) {
        if (src[j] === "\\") j++;
        else if (c === "`" && src[j] === "$" && src[j + 1] === "{") nest++;
        else if (c === "`" && nest > 0 && src[j] === "}") nest--;
        else if (src[j] === c && nest === 0) break;
        j++;
      }
      const lit = src.slice(i + 1, j);
      // `lead`: the run opens a summary (the expression's start or a ternary arm), so its head is judged.
      if (cur === null)
        runs.push((cur = { text: lit, index: i, lead: depth === 0 && [null, "?", ":"].includes(prev) }));
      else cur.text += lit;
      prev = c;
      i = j + 1;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      i = src.indexOf("\n", i);
      if (i < 0) break;
      continue;
    }
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) {
      if (depth === 0) break;
      depth--;
    } else if ((c === "," || c === ";") && depth === 0) break;
    if (c !== "+" && !/\s/.test(c)) cur = null;
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return runs;
}
