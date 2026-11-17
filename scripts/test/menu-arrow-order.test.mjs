// The menus' arrow keys skip a row that is not actionable (ui-jobs 706): a
// native `disabled` button and the positions menu's "this page" row, which is
// a div marked aria-disabled. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tools = readFileSync(new URL("../../components/shared/tools-menu.tsx", import.meta.url), "utf8");
const positions = readFileSync(new URL("../../components/shared/wallet-positions-menu.tsx", import.meta.url), "utf8");

test("moveFocus leaves out disabled and aria-disabled rows", () => {
  const body = tools.slice(tools.indexOf("export function moveFocus"), tools.indexOf("export function ToolsMenu"));
  const selector = body.match(/querySelectorAll<HTMLElement>\(\s*'([^']+)'/)?.[1];
  assert.ok(selector, "selector found");
  for (const role of ["menuitem", "menuitemcheckbox"]) {
    const part = selector.split(", ").find((s) => s.startsWith(`[role="${role}"]`));
    assert.ok(part, role);
    assert.ok(part.includes(":not([disabled])"), `${role} excludes disabled`);
    assert.ok(part.includes(':not([aria-disabled="true"])'), `${role} excludes aria-disabled`);
  }
});

test("the positions menu's current-page row carries aria-disabled", () => {
  assert.match(positions, /aria-disabled="true"\s+aria-current="page"/);
});
