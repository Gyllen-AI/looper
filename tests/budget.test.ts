import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { canonBranchNames, canonConstitution } from "../src/canon.ts";
import { HOOK_OUTPUT_CEILING, INJECTION_BUDGET } from "../src/config.ts";
import {
  assembleBranch,
  assembleConstitution,
  readProjectConstitution,
} from "../src/doctrine.ts";
import { readMap } from "../src/map.ts";

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

test("every branch firing at once still fits the budget", () => {
  const total = worstCase();
  assert.ok(
    total <= INJECTION_BUDGET,
    `doctrine at its widest is ${total} characters against a budget of ${INJECTION_BUDGET}. Something falls off silently on the turn every branch matches. Either a branch has grown past what it earns, or it is too broad to be selective and is two branches, or the budget is wrong — decide which, and write the number down.`,
  );
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

const MOST_RULES_READ_EVERY_TURN = 14;

function bulletsIn(path: string): number {
  return readFileSync(join(ROOT, path), "utf8")
    .split("\n")
    .filter((line) => line.startsWith("- ")).length;
}

test("the always-on tier cannot grow quietly", () => {
  const total = ALWAYS_ON.reduce((held, path) => held + bulletsIn(path), 0);

  assert.ok(
    total <= MOST_RULES_READ_EVERY_TURN,
    `${total} rules are read on every single turn, against a cap of ${MOST_RULES_READ_EVERY_TURN}. This cap does not find a rule said twice — prose cannot be checked for that, and five duplicates here shared no phrase at all. What it does is make adding one cost a deletion, so every new line has to answer what it replaces.`,
  );
});
