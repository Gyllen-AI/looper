import { required } from "../src/present.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assess, bodyOf, bypassIn, documentFor, freshnessOf } from "../src/freshness.ts";
import { parseFreshnessMap, parseMap } from "../src/map.ts";

const MAP = `[governs]
architecture = ["src/**"]
frontend = ["ui/**"]
`;

function governed(): string {
  const root = mkdtempSync(join(tmpdir(), "looper-fresh-"));
  mkdirSync(join(root, ".looper", "doctrine"), { recursive: true });
  writeFileSync(join(root, ".looper", "doctrine", "map.toml"), MAP);
  writeFileSync(join(root, ".looper", "doctrine", "architecture.md"), "# architecture\n");
  return root;
}

test("a governed area changed with its rule set untouched is stale", () => {
  const root = governed();
  try {
    const stale = assess(root, parseMap(MAP), ["src/api.ts"]);
    assert.equal(stale.length, 1);
    assert.equal(stale[0]?.branch, "architecture");
    assert.equal(stale[0]?.area, "src/api.ts");
    assert.equal(stale[0]?.document, ".looper/doctrine/architecture.md");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("staging the rule set beside the change is the whole point", () => {
  const root = governed();
  try {
    const staged = ["src/api.ts", documentFor("architecture")];
    assert.deepEqual([...assess(root, parseMap(MAP), staged)], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a branch with no document of its own has nothing to go stale", () => {
  const root = governed();
  try {
    assert.deepEqual([...assess(root, parseMap(MAP), ["ui/App.tsx"])], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a change outside every governed area is not the gate's business", () => {
  const root = governed();
  try {
    assert.deepEqual([...assess(root, parseMap(MAP), ["README.md"])], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a reason on its own line is a way through, and it has to say something", () => {
  assert.equal(bypassIn("a change\n\nDoctrine-freshness: renamed only"), "renamed only");
  assert.equal(bypassIn("a change\n"), "");
  assert.equal(bypassIn("a change\n\nDoctrine-freshness:   "), "");
});

test("a reason git will strip is not a reason", () => {
  const commented = "a change\n#\n# Doctrine-freshness: this line is a comment\n";
  assert.equal(bypassIn(commented), "");

  const belowScissors = [
    "a change",
    "# ------------------------ >8 ------------------------",
    "Doctrine-freshness: this is in the diff git shows you",
  ].join("\n");
  assert.equal(bypassIn(belowScissors), "");
});

test("the body stops where git stops reading", () => {
  const message = "keep\n------------------------ >8 ------------------------\ndrop";
  assert.ok(bodyOf(message).includes("keep"));
  assert.ok(!bodyOf(message).includes("drop"));
});

test("a project with no map is not asked to keep anything fresh", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-nomap-"));
  try {
    assert.equal(freshnessOf(root, "anything").kind, "clean");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const TWO_PURPOSES = `[governs]
law = ["src/**/*.ts", "tests/**/*.ts"]

[freshness]
law = ["src/law/**"]
`;

test("injection wants a broad map and staleness wants a narrow one", () => {
  const broad = required(parseMap(TWO_PURPOSES).get("law"), "the law branch for injection");
  const narrow = required(parseFreshnessMap(TWO_PURPOSES).get("law"), "the law branch for staleness");
  assert.deepEqual([...broad], ["src/**/*.ts", "tests/**/*.ts"]);
  assert.deepEqual([...narrow], ["src/law/**"]);
});

test("a map with no freshness section keeps using the one it has", () => {
  const only = `[governs]\nlaw = ["src/**"]\n`;
  const held = required(parseFreshnessMap(only).get("law"), "the law branch");
  assert.deepEqual([...held], ["src/**"]);
});
