import { test } from "node:test";
import assert from "node:assert/strict";

import { allocate } from "../src/allocator.ts";
import type { Capability, Injection } from "../src/capability.ts";

const NO_TOOLS: readonly [] = [];

function speaking(injections: readonly Injection[]): Capability {
  return {
    name: "probe",
    inject: () => injections,
    hooks: () => [],
    onHook: () => ({ kind: "pass" }),
    tools: () => NO_TOOLS,
    call: (request) => ({ kind: "unknown-tool", asked: request.tool }),
  };
}

const AT = { root: "/nowhere", budget: 100 };

test("a rule set the work raised is never dropped for budget", () => {
  const said = allocate(
    [
      speaking([
        { source: "router", priority: 0, text: "c".repeat(80), required: true },
        { source: "doctrine:law", priority: 10, text: "l".repeat(80), required: true },
      ]),
    ],
    AT,
  ).allocation;

  assert.deepEqual(
    said.dropped.map((one) => one.source),
    [],
    "adopter PR #124 counted doctrine:frontend going over the side 32 times in one session while interface work was being done. A rule that never arrived is indistinguishable from a rule that was followed, so a branch the files raised must not be droppable",
  );
  assert.ok(said.text.includes("l".repeat(80)), "the branch is actually in the text");
});

test("a budget that cannot hold the turn says so, rather than trimming quietly", () => {
  const said = allocate(
    [
      speaking([
        { source: "router", priority: 0, text: "c".repeat(80), required: true },
        { source: "doctrine:law", priority: 10, text: "l".repeat(80), required: true },
      ]),
    ],
    AT,
  ).allocation;

  assert.equal(said.overflowed, true);
  assert.match(
    said.text,
    /budget/i,
    "the reader has to be told the budget could not hold this turn, because silence reads as everything arrived",
  );
});

test("what is not required still gives way, and is named with its weight", () => {
  const said = allocate(
    [
      speaking([
        { source: "router", priority: 0, text: "c".repeat(60), required: true },
        { source: "recall", priority: 30, text: "r".repeat(600), required: false },
      ]),
    ],
    { root: "/nowhere", budget: 500 },
  ).allocation;

  assert.deepEqual(said.dropped.map((one) => one.source), ["recall"]);
  assert.equal(said.dropped[0]?.chars, 600, "a name cannot be weighed, so the size travels with it");
  assert.match(said.text, /recall \(600 chars\)/);
  assert.equal(said.overflowed, false, "dropping something optional is not an overflow");
});

test("everything fits, and nothing is said about budget at all", () => {
  const said = allocate(
    [speaking([{ source: "router", priority: 0, text: "c".repeat(10), required: true }])],
    AT,
  ).allocation;

  assert.deepEqual(said.dropped.map((one) => one.source), []);
  assert.equal(said.overflowed, false);
  assert.doesNotMatch(said.text, /budget/i);
});
