import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BULLET_CEILING, CONSTITUTION_CEILING, DOCTRINE_FILE_CEILING } from "../src/config.ts";
import { Router } from "../src/router.ts";
import { bulletsIn, isDoctrinePath, oversizedIn, sizeOfStaged } from "../src/size.ts";
import { first, gitIn } from "./helpers.ts";

test("a bullet is measured with its continuation lines, and a blank line does not end it", () => {
  const text = [
    "A branch about something.",
    "",
    "- **A rule.** With its reason on the",
    "  next line.",
    "",
    "  And a paragraph that still belongs to it.",
    "- A second rule.",
    "Not a bullet, so the second rule ended above.",
    "* A third, starred.",
  ].join("\n");
  const found = bulletsIn(text);
  assert.deepEqual(
    found.map((one) => one.line),
    [3, 7, 9],
  );
  assert.equal(
    first(found).chars,
    "**A rule.** With its reason on the next line. And a paragraph that still belongs to it.".length,
  );
});

test("a bullet past the ceiling is named with its line, and a file past its ceiling with its size", () => {
  const long = `- ${"x".repeat(BULLET_CEILING + 1)}`;
  const found = oversizedIn(".looper/doctrine/game.md", `short\n\n- fine\n${long}\n`);
  assert.deepEqual(found, [
    { kind: "bullet", path: ".looper/doctrine/game.md", line: 4, chars: BULLET_CEILING + 1, ceiling: BULLET_CEILING },
  ]);

  const bulky = Array.from({ length: 40 }, (_, at) => `- rule ${at} ${"y".repeat(40)}`).join("\n");
  assert.ok(bulky.length > DOCTRINE_FILE_CEILING, "the fixture is not over the ceiling");
  const grown = oversizedIn(".looper/doctrine/ui/assets.md", bulky);
  assert.equal(first(grown).kind, "file");

  const constitution = `- ${"z".repeat(CONSTITUTION_CEILING - 1)}`;
  assert.equal(
    first(oversizedIn(".looper/doctrine/constitution.md", constitution)).kind,
    "file",
    "the constitution is paid on every turn and has the tighter ceiling",
  );
});

test("only doctrine is measured, and the README beside it is not doctrine", () => {
  assert.equal(isDoctrinePath(".looper/doctrine/game.md"), true);
  assert.equal(isDoctrinePath(".looper/doctrine/ui/state.md"), true);
  assert.equal(isDoctrinePath("src/canon/rust.md"), true);
  assert.equal(isDoctrinePath(".looper/doctrine/README.md"), false);
  assert.equal(isDoctrinePath(".looper/doctrine/map.toml"), false);
  assert.equal(isDoctrinePath("docs/PLAN.md"), false);
});

function staged(bullet: string): string {
  const root = mkdtempSync(join(tmpdir(), "looper-size-"));
  mkdirSync(join(root, ".looper", "doctrine"), { recursive: true });
  writeFileSync(join(root, ".looper", "doctrine", "game.md"), `- ${bullet}\n`);
  gitIn(root, "init", "-q");
  gitIn(root, "add", ".");
  return root;
}

test("a commit that stages a rule past the ceiling is refused, with the line and what to do", () => {
  const root = staged("w".repeat(BULLET_CEILING + 50));
  try {
    const measured = sizeOfStaged(root);
    assert.equal(measured.kind, "measured");
    const outcome = new Router().onHook({
      root,
      event: "CommitMessage",
      payload: { kind: "text", text: "grow a rule" },
    });
    assert.equal(outcome.kind, "block");
    if (outcome.kind !== "block") return;
    assert.match(outcome.reason, /game\.md:1/);
    assert.match(outcome.reason, /recall/);
    assert.ok(!outcome.reason.includes("Doctrine-freshness"), "there is no line that waves a long rule through");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a rule within the ceiling commits", () => {
  const root = staged("The box is the evidence (2026-08-20).");
  try {
    const outcome = new Router().onHook({
      root,
      event: "CommitMessage",
      payload: { kind: "text", text: "a short rule" },
    });
    assert.equal(outcome.kind, "pass");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
