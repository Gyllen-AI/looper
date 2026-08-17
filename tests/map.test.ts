import { required } from "../src/present.ts";
import { test } from "node:test";
import assert from "node:assert/strict";

import { branchesFor, matches, parseMap } from "../src/map.ts";
import { TomlMalformed } from "../src/errors.ts";

test("a star stays inside one path segment", () => {
  assert.ok(matches("src/*.ts", "src/main.ts"));
  assert.ok(!matches("src/*.ts", "src/deep/main.ts"));
});

test("a double star crosses any number of segments, including none", () => {
  assert.ok(matches("src/**/*.ts", "src/main.ts"));
  assert.ok(matches("src/**/*.ts", "src/canon/deep/law.ts"));
  assert.ok(!matches("src/**/*.ts", "tests/main.ts"));
});

test("a literal path matches only itself", () => {
  assert.ok(matches("PLAN.md", "PLAN.md"));
  assert.ok(!matches("PLAN.md", "docs/PLAN.md"));
});

test("a star matches inside a name, not only whole names", () => {
  assert.ok(matches("src/*.test.ts", "src/map.test.ts"));
  assert.ok(!matches("src/*.test.ts", "src/map.ts"));
});

test("the map reads branch to paths", () => {
  const governs = parseMap(`
# a comment
[governs]
law = ["src/**/*.ts", "tests/**/*.ts"]
process = ["PLAN.md"]
`);

  assert.deepEqual([...governs.keys()], ["law", "process"]);
  assert.deepEqual([...required(governs.get("process"), "process")], ["PLAN.md"]);
});

test("keys outside the governs section are ignored", () => {
  const governs = parseMap(`
[other]
law = ["everything"]

[governs]
law = ["src/**"]
`);

  assert.deepEqual([...required(governs.get("law"), "law")], ["src/**"]);
});

test("an empty list is a branch that governs nothing, not an error", () => {
  const governs = parseMap(`[governs]\nlaw = []\n`);
  assert.deepEqual([...required(governs.get("law"), "law")], []);
});

test("a malformed line refuses with the line number and the shape wanted", () => {
  assert.throws(() => parseMap(`[governs]\nlaw = src/**\n`), TomlMalformed);
  assert.throws(() => parseMap(`[governs]\nlaw\n`), TomlMalformed);
  assert.throws(() => parseMap(`[governs]\nlaw = [src/**]\n`), TomlMalformed);
});

test("only the branches whose area was touched are selected", () => {
  const governs = parseMap(`
[governs]
law = ["src/**/*.ts"]
process = ["PLAN.md"]
frontend = ["ui/**"]
`);

  assert.deepEqual([...branchesFor(governs, ["src/main.ts"])], ["law"]);
  assert.deepEqual([...branchesFor(governs, ["PLAN.md", "src/map.ts"])], [
    "law",
    "process",
  ]);
  assert.deepEqual([...branchesFor(governs, ["README.md"])], []);
});
