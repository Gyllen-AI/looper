import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { canonBranchNames, canonGoverns, pulledByName } from "../src/canon.ts";

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
