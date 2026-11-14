/**
 * Static gate: a position card holds at most 4 headlines and 6 stats
 * (rails-ops decision 0040, TO-DO-position-card 341).
 *
 * The shell marks a card past the caps at render (`data-card-over-cap`,
 * components/shared/position-card.tsx), but only on the positions a browser
 * happens to open. This gate reads every family's slot builder through the
 * TypeScript checker and works out the most headlines and stats the builder
 * can hand the shell on any path:
 *
 *   • a slot builder is a function whose return type is `PositionCardSlots`
 *     (or one of its members), a function called in `<PositionCard
 *     slots={f(…)}>`, the component that passes `slots` built in place, or
 *     one that hands headlines or stats down as a prop;
 *   • a headline is an object literal the checker types as `PositionCardHead`,
 *     a stat one it types as `PositionPanelRow`, wherever they are written:
 *     in the builder or in a function it calls, followed across files;
 *   • ifs in one block testing one subject against different values
 *     (`if (family === "sgho")`, `if (family === "stata")`) are alternatives;
 *   • an element assigned over (`heads[0] = { …heads[0], sub }`) is not new;
 *   • branches count as alternatives: the larger side of a `?:` or an
 *     if/else, and the larger of an early return and what follows it;
 *     statements in sequence add up;
 *   • a headline or stat made inside a loop or an array callback (`map`,
 *     `forEach`, `flatMap`) counts as unbounded, except a `map` over the
 *     headlines or stats themselves, which remakes them one for one.
 *
 * It reads the source, not the data, so it can overcount: two rows on paths
 * the data never takes together (an early return of one row next to the row
 * it would have joined) both count. It does not see a row that arrives as a
 * prop from a page, or a builder whose return type the checker cannot name.
 *
 * The builders over the caps today are listed, with their counts, in
 * scripts/card-caps-over.txt: each waits on its protocol's review (decision
 * 0040 point 4). The check fails on a builder over a cap that is not listed,
 * and on a listed builder whose count has changed (the list follows the code,
 * and only shrinks as the reviews land). Run with `--write` to rewrite the
 * list from the tree, `--all` to print every builder's counts.
 *
 *   node scripts/check-card-caps.mjs [--write] [--all]
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const LIST = path.join(ROOT, "scripts/card-caps-over.txt");
const MAX_HEADS = 4;
const MAX_STATS = 6;
const write = process.argv.includes("--write");
const all = process.argv.includes("--all");

// The caps are the shell's; read them so the gate cannot drift from it.
const panelSrc = fs.readFileSync(path.join(ROOT, "components/shared/position-card-panel.tsx"), "utf8");
const capOf = (name) => Number(panelSrc.match(new RegExp(`export const ${name} = (\\d+);`))?.[1]);
if (capOf("POSITION_CARD_MAX_HEADS") !== MAX_HEADS || capOf("POSITION_CARD_MAX_STATS") !== MAX_STATS) {
  console.error("check:card-caps: the caps in position-card-panel.tsx no longer read 4 and 6; update this gate.");
  process.exit(1);
}

const config = ts.getParsedCommandLineOfConfigFile(
  path.join(ROOT, "tsconfig.json"),
  {},
  {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      console.error(ts.flattenDiagnosticMessageText(d.messageText, "\n"));
      process.exit(1);
    },
  },
);
const files = config.fileNames.filter((f) => /\/(components|app|lib)\//.test(f) && /\.tsx?$/.test(f));
const program = ts.createProgram(files, { ...config.options, noEmit: true, incremental: false });
const checker = program.getTypeChecker();
const rel = (f) => path.relative(ROOT, f);
const ours = (sf) => sf && !sf.isDeclarationFile && !sf.fileName.includes("/node_modules/");

const HEAD_TYPES = new Set(["PositionCardHead"]);
const STAT_TYPES = new Set(["PositionPanelRow"]);
const SLOT_TYPES = new Set([
  "PositionCardSlots",
  "PositionCardDetailSlots",
  "PositionCardListingSlots",
  "PositionCardDetailOpen",
  "PositionCardDetailClosed",
]);

/** The names a type answers to: its alias, its symbol, each union member's. */
function typeNames(type) {
  const names = new Set();
  const visit = (t) => {
    if (!t) return;
    if (t.aliasSymbol) names.add(t.aliasSymbol.name);
    if (t.symbol) names.add(t.symbol.name);
    if (t.isUnion()) t.types.forEach(visit);
  };
  visit(type);
  return names;
}
const isKind = (type, set) => [...typeNames(type)].some((n) => set.has(n));

/** The type a literal is written into. The checker gives none inside a
 *  spread (`[...(c ? [{ id }] : [])]`), so climb to the array it lands in. */
function contextOf(node) {
  const own = checker.getContextualType(node);
  if (own) return own;
  for (let n = node, p = node.parent; p; n = p, p = p.parent) {
    if (ts.isArrayLiteralExpression(p)) {
      const t = checker.getContextualType(p);
      if (t) return checker.getIndexTypeOfType(t, ts.IndexKind.Number) ?? undefined;
    } else if (
      !ts.isParenthesizedExpression(p) &&
      !ts.isConditionalExpression(p) &&
      !ts.isSpreadElement(p) &&
      !(ts.isBinaryExpression(p) && p.operatorToken.kind !== ts.SyntaxKind.EqualsToken)
    )
      return undefined;
  }
  return undefined;
}

/** The function a call reaches, where it is ours. */
function calleeDecl(call) {
  let sym = checker.getSymbolAtLocation(
    ts.isPropertyAccessExpression(call.expression) ? call.expression.name : call.expression,
  );
  if (!sym) return null;
  if (sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
  for (const d of sym.declarations ?? []) {
    if (!ours(d.getSourceFile())) continue;
    if (ts.isFunctionDeclaration(d) || ts.isMethodDeclaration(d)) return d.body ? d : null;
    if (
      ts.isVariableDeclaration(d) &&
      d.initializer &&
      (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))
    )
      return d.initializer;
  }
  return null;
}

const LOOP_CALLBACKS = new Set(["map", "flatMap", "forEach", "reduce"]);
const terminates = (s) => {
  if (!s) return false;
  if (ts.isReturnStatement(s) || ts.isThrowStatement(s)) return true;
  if (ts.isBlock(s)) return s.statements.length > 0 && terminates(s.statements[s.statements.length - 1]);
  if (ts.isIfStatement(s)) return terminates(s.thenStatement) && terminates(s.elseStatement);
  return false;
};

/** `x === "a"` at the head of a condition (or of its `&&` chain): the subject
 *  and the value it is tested against. */
function discriminant(cond) {
  if (ts.isParenthesizedExpression(cond)) return discriminant(cond.expression);
  if (!ts.isBinaryExpression(cond)) return null;
  const op = cond.operatorToken.kind;
  if (op === ts.SyntaxKind.AmpersandAmpersandToken) return discriminant(cond.left);
  if (op !== ts.SyntaxKind.EqualsEqualsEqualsToken) return null;
  if (!ts.isStringLiteral(cond.right) && !ts.isNumericLiteral(cond.right)) return null;
  return { subject: cond.left.getText(), value: cond.right.text };
}

/** The runs of ifs in one statement list that test one subject against
 *  different values, with no else and no return: at most one of them runs. */
function exclusiveRuns(stmts) {
  const run = new Map();
  const skip = new Set();
  const open = (s) =>
    ts.isIfStatement(s) && !s.elseStatement && !terminates(s.thenStatement) && discriminant(s.expression);
  stmts.forEach((s, i) => {
    if (skip.has(s) || !open(s)) return;
    const d = discriminant(s.expression);
    const group = [s];
    const seen = new Set([d.value]);
    for (const t of stmts.slice(i + 1)) {
      const e = open(t) ? discriminant(t.expression) : null;
      if (e && e.subject === d.subject && !seen.has(e.value)) {
        seen.add(e.value);
        group.push(t);
      }
    }
    if (group.length < 2) return;
    run.set(s, group);
    group.slice(1).forEach((t) => skip.add(t));
  });
  return { run, skip };
}

/** The most literals of one kind a function can make on any path. */
function counter(kinds) {
  const memo = new Map();
  const active = new Set();
  const fn = (decl) => {
    if (memo.has(decl)) return memo.get(decl);
    if (active.has(decl)) return 0;
    active.add(decl);
    const body = decl.body;
    const n = !body ? 0 : ts.isBlock(body) ? seq(body.statements, 0) : expr(body);
    active.delete(decl);
    memo.set(decl, n);
    return n;
  };
  // Each statement list once: its runs of `if (x === "a") {…}`,
  // `if (x === "b") {…}` on one subject, which no path takes two of, and the
  // count from each index on.
  const seqMemo = new Map();
  const seq = (stmts, i) => {
    let m = seqMemo.get(stmts);
    if (!m) seqMemo.set(stmts, (m = { at: new Map(), ...exclusiveRuns(stmts) }));
    if (m.at.has(i)) return m.at.get(i);
    let n;
    if (i >= stmts.length) n = 0;
    else {
      const s = stmts[i];
      if (m.skip.has(s)) n = seq(stmts, i + 1);
      else if (m.run.has(s))
        n = Math.max(...m.run.get(s).map((x) => expr(x.expression) + stmt(x.thenStatement))) + seq(stmts, i + 1);
      else if (ts.isIfStatement(s)) {
        const rest = seq(stmts, i + 1);
        const t = stmt(s.thenStatement) + (terminates(s.thenStatement) ? 0 : rest);
        const e = (s.elseStatement ? stmt(s.elseStatement) : 0) + (terminates(s.elseStatement) ? 0 : rest);
        n = expr(s.expression) + Math.max(t, e);
      } else if (ts.isReturnStatement(s) || ts.isThrowStatement(s)) n = s.expression ? expr(s.expression) : 0;
      else n = stmt(s) + seq(stmts, i + 1);
    }
    m.at.set(i, n);
    return n;
  };
  const stmt = (s) => {
    if (!s) return 0;
    if (ts.isBlock(s)) return seq(s.statements, 0);
    if (ts.isIfStatement(s)) return seq([s], 0);
    if (ts.isFunctionDeclaration(s)) return 0;
    if (
      ts.isForStatement(s) ||
      ts.isForOfStatement(s) ||
      ts.isForInStatement(s) ||
      ts.isWhileStatement(s) ||
      ts.isDoStatement(s)
    )
      return stmt(s.statement) > 0 ? Infinity : 0;
    if (ts.isSwitchStatement(s))
      return expr(s.expression) + Math.max(0, ...s.caseBlock.clauses.map((c) => seq(c.statements, 0)));
    let n = 0;
    ts.forEachChild(s, (c) => {
      n += ts.isStatement(c) || ts.isBlock(c) ? stmt(c) : expr(c);
    });
    return n;
  };
  const expr = (e) => {
    if (!e) return 0;
    if (ts.isObjectLiteralExpression(e)) {
      if (isKind(contextOf(e), kinds)) return 1;
    } else if (ts.isConditionalExpression(e)) {
      return expr(e.condition) + Math.max(expr(e.whenTrue), expr(e.whenFalse));
    } else if (ts.isBinaryExpression(e)) {
      const op = e.operatorToken.kind;
      if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken)
        return Math.max(expr(e.left), expr(e.right));
      // `heads[0] = { ...heads[0], sub }` replaces one already counted.
      if (op === ts.SyntaxKind.EqualsToken && ts.isElementAccessExpression(e.left)) return 0;
    } else if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) {
      // A function written here runs where it is called: a call reaches it
      // through `calleeDecl`; a callback is counted at its call below.
      return 0;
    } else if (ts.isCallExpression(e)) {
      let n = expr(e.expression);
      const decl = calleeDecl(e);
      if (decl) n += fn(decl);
      const method = ts.isPropertyAccessExpression(e.expression) ? e.expression.name.text : null;
      // A callback over an array of the kind itself (`heads.map((h) => ({
      // ...h, tier }))`) remakes what is counted already; over anything else
      // it makes one per element, with no bound the source states.
      const remakes =
        method === "map" &&
        ts.isPropertyAccessExpression(e.expression) &&
        isKind(
          checker.getIndexTypeOfType(checker.getTypeAtLocation(e.expression.expression), ts.IndexKind.Number),
          kinds,
        );
      for (const a of e.arguments) {
        if (ts.isArrowFunction(a) || ts.isFunctionExpression(a)) {
          const inner = fn(a);
          n += inner > 0 && LOOP_CALLBACKS.has(method) ? (remakes ? 0 : Infinity) : inner;
        } else n += expr(a);
      }
      return n;
    }
    let n = 0;
    ts.forEachChild(e, (c) => {
      n += ts.isStatement(c) || ts.isBlock(c) ? stmt(c) : expr(c);
    });
    return n;
  };
  return fn;
}

// The slot builders.
const builders = new Map();
const addBuilder = (decl) => {
  if (decl && decl.body && !builders.has(decl)) builders.set(decl, null);
};
for (const sf of program.getSourceFiles()) {
  if (!ours(sf) || !files.includes(sf.fileName)) continue;
  const visit = (node) => {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node) ||
      ts.isMethodDeclaration(node)
    ) {
      const sig = checker.getSignatureFromDeclaration(node);
      if (sig && isKind(checker.getReturnTypeOfSignature(sig), SLOT_TYPES)) addBuilder(node);
    }
    // A component handing headlines or stats down as a prop (the vault
    // pages' `<VaultCard stats={…}>`) builds them.
    if (
      ts.isJsxAttribute(node) &&
      node.initializer &&
      ts.isJsxExpression(node.initializer) &&
      node.initializer.expression
    ) {
      const t = checker.getContextualType(node.initializer.expression);
      const el = t && checker.getIndexTypeOfType(checker.getNonNullableType(t), ts.IndexKind.Number);
      if (el && (isKind(el, HEAD_TYPES) || isKind(el, STAT_TYPES))) {
        let f = node.parent;
        while (f && !ts.isFunctionDeclaration(f) && !ts.isArrowFunction(f) && !ts.isFunctionExpression(f)) f = f.parent;
        addBuilder(f);
      }
    }
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText() === "slots" &&
      node.initializer &&
      ts.isJsxExpression(node.initializer)
    ) {
      const x = node.initializer.expression;
      if (x && ts.isCallExpression(x)) addBuilder(calleeDecl(x));
      // Slots built in place (a variable or an object in the component):
      // the component is the builder.
      else if (x) {
        let f = node.parent;
        while (f && !ts.isFunctionDeclaration(f) && !ts.isArrowFunction(f) && !ts.isFunctionExpression(f)) f = f.parent;
        addBuilder(f);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const heads = counter(HEAD_TYPES);
const stats = counter(STAT_TYPES);
const nameOf = (decl) => {
  const sf = decl.getSourceFile();
  let name = decl.name?.getText();
  if (!name && ts.isVariableDeclaration(decl.parent)) name = decl.parent.name.getText();
  if (!name) name = `line ${sf.getLineAndCharacterOfPosition(decl.getStart()).line + 1}`;
  return `${rel(sf.fileName)}#${name}`;
};
const fmt = (n) => (n === Infinity ? "unbounded" : String(n));
const rows = [...builders.keys()]
  .map((d) => ({ key: nameOf(d), h: heads(d), s: stats(d) }))
  .filter((r) => r.h > 0 || r.s > 0)
  .sort((a, b) => a.key.localeCompare(b.key));

if (all) for (const r of rows) console.log(`${r.key}  ${fmt(r.h)} headlines, ${fmt(r.s)} stats`);

const over = rows.filter((r) => r.h > MAX_HEADS || r.s > MAX_STATS);
const line = (r) => `${r.key} headlines=${fmt(r.h)} stats=${fmt(r.s)}`;
const HEADER =
  "# Position-card slot builders over the caps (4 headlines, 6 stats; decision 0040),\n" +
  "# each waiting on its protocol's review (TO-DO-position-card 341). Written by\n" +
  "# `node scripts/check-card-caps.mjs --write`; the counts are the most the source can reach.\n";

if (write) {
  fs.writeFileSync(LIST, HEADER + over.map(line).join("\n") + "\n");
  console.log(`check:card-caps: wrote ${over.length} builders to ${rel(LIST)}`);
  process.exit(0);
}

const listed = new Map(
  (fs.existsSync(LIST) ? fs.readFileSync(LIST, "utf8") : "")
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => [l.split(" ")[0], l.trim()]),
);
const problems = [];
for (const r of over) {
  const was = listed.get(r.key);
  if (!was) problems.push(`over the caps and not listed: ${line(r)}`);
  else if (was !== line(r)) problems.push(`count changed: listed "${was}", now "${line(r)}"`);
}
const overKeys = new Set(over.map((r) => r.key));
for (const [key, was] of listed) if (!overKeys.has(key)) problems.push(`listed but within the caps now: "${was}"`);

if (problems.length) {
  console.error(`check:card-caps: ${problems.length} problem(s)\n  ${problems.join("\n  ")}`);
  console.error(`(rewrite ${rel(LIST)} with --write once the change is the intended one)`);
  process.exit(1);
}
console.log(`check:card-caps: ${rows.length} slot builders read, ${over.length} over the caps and listed`);
