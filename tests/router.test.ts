import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { INJECTION_BUDGET } from "../src/config.ts";
import { Router } from "../src/router.ts";
import { first, gitIn } from "./helpers.ts";

const MAP = `[governs]
game = ["game/**"]
`;

function committed(): string {
  const root = mkdtempSync(join(tmpdir(), "looper-router-"));
  mkdirSync(join(root, ".looper", "doctrine"), { recursive: true });
  mkdirSync(join(root, "game"), { recursive: true });
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, ".looper", "doctrine", "map.toml"), MAP);
  writeFileSync(join(root, ".looper", "doctrine", "game.md"), "- The box is the evidence.\n");
  writeFileSync(join(root, "game", "Plugin.cs"), "class Plugin {}\n");
  writeFileSync(join(root, "src", "main.rs"), "fn main() {}\n");
  gitIn(root, "init", "-q");
  gitIn(root, "-c", "user.name=t", "-c", "user.email=t@t", "add", ".");
  gitIn(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "first");
  return root;
}

test("a clean tree signals nothing, whatever the last commit touched", () => {
  const root = committed();
  try {
    assert.deepEqual([...new Router().signalled(root)], []);
    const injected = new Router().inject({ root, budget: INJECTION_BUDGET });
    assert.equal(injected.length, 1, "only the constitution and the index, which are one contribution");
    assert.ok(first(injected).required);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("what is being edited raises its branches, the project's own first, and the first cannot be dropped", () => {
  const root = committed();
  try {
    writeFileSync(join(root, "game", "Plugin.cs"), "class Plugin { int x; }\n");
    writeFileSync(join(root, "src", "main.rs"), "fn main() { let x = 1; }\n");
    assert.deepEqual([...new Router().signalled(root)], ["game", "csharp", "rust"]);

    const injected = new Router().inject({ root, budget: INJECTION_BUDGET });
    const branches = injected.filter((one) => one.source.startsWith("doctrine:"));
    assert.deepEqual(
      branches.map((one) => [one.source, one.required]),
      [
        ["doctrine:game", true],
        ["doctrine:csharp", false],
        ["doctrine:rust", false],
      ],
      "the branch raised most strongly by the files in hand is the one that must not go over the side when the budget is short",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a file not yet committed is work in hand", () => {
  const root = committed();
  try {
    writeFileSync(join(root, "game", "Other.cs"), "class Other {}\n");
    assert.deepEqual([...new Router().signalled(root)], ["game", "csharp"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("outside a repository the constitution says the branches could not be loaded", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-nogit-"));
  try {
    assert.deepEqual([...new Router().signalled(root)], []);
    assert.match(new Router().unreachable(root), /were not loaded/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
