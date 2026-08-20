import { test } from "node:test";
import { NO_TURN } from "../src/capability.ts";
import { NEVER_SAID } from "../src/said.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { canonBranchNames, canonConstitution } from "../src/canon.ts";
import { BRANCH_PRIORITY, HOOK_OUTPUT_CEILING, INJECTION_BUDGET, LOOP_PRIORITY } from "../src/config.ts";
import { saidAbout } from "../src/loop/capability.ts";
import {
  assembleBranch,
  assembleConstitution,
  branchIndex,
  readProjectConstitution,
} from "../src/doctrine.ts";
import { readMap } from "../src/map.ts";
import { allocate } from "../src/allocator.ts";
import type { Capability, HookEvent, Injection, Outcome } from "../src/capability.ts";

const NO_EVENTS: readonly HookEvent[] = [];

class Standing implements Capability {
  readonly name: string;
  readonly at: number;

  constructor(name: string, at: number) {
    this.name = name;
    this.at = at;
  }

  inject(): readonly Injection[] {
    return [{ source: this.name, priority: this.at, text: "x".repeat(200) }];
  }

  hooks(): readonly HookEvent[] {
    return NO_EVENTS;
  }

  onHook(): Outcome {
    return { kind: "pass" };
  }
}

const ROOT = join(import.meta.dirname, "..");

function alwaysOn(): number {
  return assembleConstitution(readProjectConstitution(ROOT)).text.length;
}

function everyBranchName(): readonly string[] {
  const map = readMap(ROOT);
  const mapped = map.kind === "present" ? [...map.governs.keys()] : [];
  return [...new Set([...canonBranchNames(), ...mapped])];
}

function worstCase(): number {
  let total = alwaysOn();
  for (const name of everyBranchName()) {
    const branch = assembleBranch(ROOT, name);
    if (branch.kind === "found") total += branch.text.length + 2;
  }
  return total;
}

test("the budget stays under the ceiling the agent will accept", () => {
  assert.ok(
    INJECTION_BUDGET < HOOK_OUTPUT_CEILING,
    "a hook may return at most 10000 characters, so a budget at or above it can be truncated by the agent rather than by us, and truncation we did not do is truncation we cannot mark",
  );
});

test("any one kind of work is served in full, constitution and its branch together", () => {
  const constant = alwaysOn();
  for (const name of everyBranchName()) {
    const branch = assembleBranch(ROOT, name);
    if (branch.kind !== "found") continue;
    const total = constant + branch.text.length + 2;
    assert.ok(
      total <= INJECTION_BUDGET,
      `the constitution plus ${name} is ${total} characters against a budget of ${INJECTION_BUDGET}. A single kind of work must arrive whole: if one branch alone cannot fit beside the constitution, it is too big for what it earns, or it is two branches.`,
    );
  }
});

test("a turn that touches everything drops the least urgent set, and says which", () => {
  const run = allocate(everyBranchName().map((name, at) => new Standing(name, at)), {
    root: ROOT,
    budget: 400,
    turn: NO_TURN,
    said: NEVER_SAID,
  });

  assert.ok(
    run.allocation.dropped.length > 0,
    "a 400-character budget held every rule set, which means this test is no longer exercising the thing it was written for",
  );
  assert.ok(
    run.allocation.text.includes("dropped for budget"),
    "a rule set was left out and the agent was not told. A doctrine that quietly shrinks is worse than a short one, because nothing downstream can tell which rules were in force.",
  );
  for (const { source: name } of run.allocation.dropped) {
    assert.ok(
      run.allocation.text.includes(name),
      `${name} was dropped and not named, so nobody can tell what was missing`,
    );
  }
});

test("the always-on tier is the smaller half", () => {
  const constant = alwaysOn();
  const conditional = worstCase() - constant;
  assert.ok(
    constant < conditional,
    `the constitution is ${constant} characters and every branch together is ${conditional}. The always-on tier is paid on every single turn, so when it outweighs the part that only sometimes loads, the tree has stopped being a tree.`,
  );
});

test("the canon alone fits, for a project with no doctrine of its own", () => {
  assert.ok(canonConstitution().length < INJECTION_BUDGET);
});

const ALWAYS_ON: readonly string[] = [
  "src/canon/constitution.md",
  ".looper/doctrine/constitution.md",
];

const MOST_CHARS_READ_EVERY_TURN = 2600;

function charsIn(path: string): number {
  return readFileSync(join(ROOT, path), "utf8").length;
}

test("the always-on tier cannot grow quietly", () => {
  const total =
    ALWAYS_ON.reduce((held, path) => held + charsIn(path), 0) + branchIndex(ROOT).length;

  assert.ok(
    total <= MOST_CHARS_READ_EVERY_TURN,
    `${total} characters are read on every single turn, against a cap of ${MOST_CHARS_READ_EVERY_TURN}. Counting bullets stopped working when the branch index became one line per branch: twenty-seven short lines are not twenty-seven rules. Characters are what the budget actually spends, and this cap makes adding one cost a deletion.`,
  );
});

test("the line that reports a drop is paid for out of the budget, not added to it", () => {
  for (const budget of [400, 1200, 3000, 6000, 9000]) {
    const run = allocate(
      everyBranchName().map((name, at) => new Standing(name, at)),
      { root: ROOT, budget },
    );
    const allocation = run.allocation;
    if (allocation.dropped.length === 0) continue;

    if (allocation.chars > budget) {
      assert.ok(
        allocation.overflowed,
        `at a budget of ${budget} the answer is ${allocation.chars} characters and nothing says it went over. The marker naming what was dropped grows with the number dropped, so the case that reports the problem is the case that makes it worse.`,
      );
    }
    for (const { source: name } of allocation.dropped) {
      assert.ok(allocation.text.includes(name), `${name} was dropped without being named`);
    }
  }
});

test("a doctrine branch that does not fit is dropped and named, never sent anyway", () => {
  const branches = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"];
  const capabilities = branches.map(
    (name, at) =>
      ({
        name: `doctrine:${name}`,
        inject: () => [
          { source: `doctrine:${name}`, priority: 10 + at, text: "x".repeat(3000), required: false },
        ],
        hooks: () => NO_EVENTS,
        onHook: (): Outcome => ({ kind: "pass" }),
      }) satisfies Capability,
  );
  const { allocation } = allocate(capabilities, { root: process.cwd(), budget: INJECTION_BUDGET, turn: NO_TURN, said: NEVER_SAID });
  assert.ok(
    allocation.chars <= INJECTION_BUDGET,
    `doctrine went out at ${allocation.chars} chars against a ceiling of ${INJECTION_BUDGET}. Marking a branch required makes the budget decorative for the only thing it governs`,
  );
  assert.ok(
    allocation.dropped.length > 0,
    "six branches of 3000 chars fit in 9800 and nothing was dropped",
  );
  for (const one of allocation.dropped) {
    assert.ok(
      allocation.text.includes(one.source),
      `${one.source} was dropped and its name never reached the reader`,
    );
  }
});

test("a check known broken outranks a rule set, because a fault now beats a rule you might need", () => {
  const kept = {
    at: "2026-08-20T00:00:00Z",
    ok: 3,
    broken: 1,
    blind: 0,
    failing: ["loop.uplink"],
    brokenNames: ["loop.uplink"],
    blindNames: [],
  };
  const alarm = saidAbout(kept, Date.parse("2026-08-20T00:05:00Z"));
  const branches = ["alpha", "beta", "gamma", "delta", "epsilon"];
  const speaking: readonly Capability[] = [
    {
      name: "loop",
      inject: () => [{ source: "loop", priority: LOOP_PRIORITY, text: alarm, required: false }],
      hooks: () => NO_EVENTS,
      onHook: (): Outcome => ({ kind: "pass" }),
    },
    ...branches.map((name) => ({
      name: `doctrine:${name}`,
      inject: () => [
        { source: `doctrine:${name}`, priority: BRANCH_PRIORITY, text: "b".repeat(2400), required: false },
      ],
      hooks: () => NO_EVENTS,
      onHook: (): Outcome => ({ kind: "pass" }),
    })),
  ];
  const { allocation } = allocate(speaking, { root: process.cwd(), budget: INJECTION_BUDGET, turn: NO_TURN, said: NEVER_SAID });

  assert.ok(
    allocation.text.includes("loop.uplink"),
    "the budget was full of rule sets and the one line saying a layer is broken went over the side. A rule that does not arrive can be pulled by name; a fault nobody mentions is one the reader does not know to ask about",
  );
  assert.ok(
    allocation.dropped.some((one) => one.source.startsWith("doctrine:")),
    "nothing was dropped, so this proves nothing about the ordering",
  );
});
