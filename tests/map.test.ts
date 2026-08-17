import { required } from "../src/present.ts";
import { test } from "node:test";
import assert from "node:assert/strict";

import { branchesFor, matches, parseMap, withCanonDefaults } from "../src/map.ts";
import { canonGoverns } from "../src/canon.ts";
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

test("the branch governing most of what was touched arrives first", () => {
  const governs = parseMap(`
[governs]
law = ["src/**/*.ts"]
frontend = ["ui/**"]
`);

  assert.deepEqual(
    [...branchesFor(governs, ["src/a.ts", "src/b.ts", "ui/panel.tsx"])],
    ["law", "frontend"],
    "a turn wider than the budget drops from the end, so the order is a judgement about which rules this turn is actually about. Alphabetical order is not that judgement.",
  );
  assert.deepEqual(
    [...branchesFor(governs, ["src/a.ts", "ui/one.tsx", "ui/two.tsx"])],
    ["frontend", "law"],
  );
});

test("the canon's own map is filled in only where the project said nothing", () => {
  const project = parseMap(`[governs]\nlaw = ["only/here/**"]\n`);
  const merged = withCanonDefaults(project, canonGoverns());

  assert.deepEqual([...merged.get("law")], ["only/here/**"], "the project's own mapping was overwritten");
  assert.ok(merged.has("rust"), "a branch the project never mentioned did not get the canon's default");
  assert.deepEqual([...branchesFor(merged, ["src/a.ts"])], [], "the canon default fired for a branch the project had claimed");
  assert.deepEqual([...branchesFor(merged, ["crates/a/src/main.rs"])], ["architecture", "rust"].filter((name) => merged.has(name)));
});
