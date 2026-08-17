import { test } from "node:test";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

import { canonBranchNames, canonBranches, canonConstitution } from "../src/canon.ts";
import { assembleConstitution } from "../src/doctrine.ts";

const FOREIGN_VOCABULARY: readonly string[] = [
  "8c5697e5d468b1ad",
  "2d04bdd7dc024c55",
  "018c436ab6a05404",
  "96b357ed6de527e2",
  "21653dffc64e80df",
  "61d3d85bec242401",
  "852623c357c7bfdf",
  "3322532d8589f95c",
  "80391e0a1eacd6e0",
  "b57b18825f0e1e1b",
];

function fingerprint(word: string): string {
  return createHash("sha256").update(word).digest("hex").slice(0, 16);
}

function wordsIn(text: string): readonly string[] {
  const found = text.toLowerCase().match(/[a-z][a-z-]*[a-z]|[a-z]+/g);
  return found === null ? [] : found;
}

function everyCanonFile(): readonly string[] {
  return [canonConstitution(), ...canonBranches().map((branch) => branch.body)];
}

test("a project with no doctrine of its own still receives real rules", () => {
  const assembly = assembleConstitution({ kind: "absent" });

  assert.ok(assembly.text.length > 0);
  assert.deepEqual([...assembly.halves], ["canon"]);
});

test("an empty doctrine file is the same as none, never an empty injection", () => {
  const assembly = assembleConstitution({ kind: "empty" });
  assert.deepEqual([...assembly.halves], ["canon"]);
});

test("the canon half comes first, the project half after it", () => {
  const assembly = assembleConstitution({ kind: "present", text: "PROJECT RULE" });

  assert.deepEqual([...assembly.halves], ["canon", "project"]);
  assert.ok(assembly.text.startsWith(canonConstitution()));
  assert.ok(assembly.text.endsWith("PROJECT RULE"));
});

test("no host-project vocabulary reached the canon", () => {
  for (const body of everyCanonFile()) {
    const lowered = body.toLowerCase();
    for (const word of wordsIn(lowered)) {
      assert.ok(
        !FOREIGN_VOCABULARY.includes(fingerprint(word)),
        `the canon ships to everyone and must name nobody, but it contains "${word}"`,
      );
    }
  }
});

test("the canon names no capability that is not wired", () => {
  for (const body of everyCanonFile()) {
    assert.ok(
      !body.includes("judged at edit time"),
      "the canon must not claim enforcement that is not built",
    );
  }
});

test("every declared branch has a body", () => {
  const branches = canonBranches();
  assert.deepEqual(
    branches.map((branch) => branch.name),
    [...canonBranchNames()],
  );
  for (const branch of branches) assert.ok(branch.body.length > 0);
});
