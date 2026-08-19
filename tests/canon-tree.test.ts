import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { canonBranchNames, canonGoverns, pulledByName } from "../src/canon.ts";
import { isABranchName } from "../src/doctrine.ts";

const CANON = join(import.meta.dirname, "..", "src", "canon");

function everyCanonFile(dir: string, prefix: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...everyCanonFile(full, `${prefix}${entry}/`));
      continue;
    }
    if (entry.endsWith(".md")) found.push(`${prefix}${entry.slice(0, -3)}`);
  }
  return found;
}

test("every branch the canon names has a file, so a name cannot dangle", () => {
  for (const name of canonBranchNames()) {
    assert.ok(
      existsSync(join(CANON, `${name}.md`)),
      `${name} is listed as a branch and has no file, so reading it throws at the moment somebody needs it`,
    );
  }
});

test("every canon file is reachable, because one nobody can name is one nobody gets", () => {
  const named = new Set<string>([...canonBranchNames(), "constitution"]);
  for (const file of everyCanonFile(CANON, "")) {
    assert.ok(named.has(file), `src/canon/${file}.md exists and no branch name reaches it`);
  }
});

test("a branch is routed by path or pulled by name, never neither", () => {
  const governed = new Set(canonGoverns().keys());
  const byName = new Set(pulledByName());
  const orphans = canonBranchNames().filter((n) => !governed.has(n) && !byName.has(n));
  assert.deepEqual(
    orphans,
    [],
    "a branch with no path and no name entry can never be selected, which is a rule that never arrives",
  );
});

test("a branch stays small enough to be worth injecting whole", () => {
  const TOO_BIG = 2500;
  const oversized: string[] = [];
  for (const name of canonBranchNames()) {
    const size = readFileSync(join(CANON, `${name}.md`), "utf8").length;
    if (size > TOO_BIG) oversized.push(`${name} is ${size} chars`);
  }
  assert.deepEqual(
    oversized,
    [],
    `a branch past ${TOO_BIG} chars is one the budget will drop whole; split it instead`,
  );
});

test("every canon branch can hold a project half, or the tree only ever governs half of it", () => {
  const unreachable = canonBranchNames().filter((name) => !isABranchName(name));
  assert.deepEqual(
    unreachable,
    [],
    "readProjectBranch refuses a name this guard rejects, so these branches would be canon-only forever: an adopter could never write their half of them, which is the whole reason the tree has this many branches",
  );
});

test("a branch name is still a name and never a way out of the doctrine folder", () => {
  for (const escape of ["../secrets", "ui/../../etc/passwd", "/etc/passwd", "ui\\state", "..", "ui//state", ""]) {
    assert.equal(isABranchName(escape), false, `${escape} was accepted as a branch name and it is a path`);
  }
  for (const fine of ["frontend", "ui/state", "data/schema", "work/deploy"]) {
    assert.equal(isABranchName(fine), true, `${fine} is a branch name and was refused`);
  }
});
