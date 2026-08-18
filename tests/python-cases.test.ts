import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PYTHON_CASES } from "../audit/python-cases.ts";
import { judgePython } from "../src/law/python/drive.ts";

const LOOPER = join(import.meta.dirname, "..");

function firedOn(code: string): readonly string[] {
  const root = mkdtempSync(join(tmpdir(), "looper-py-"));
  try {
    const path = join(root, "held.py");
    writeFileSync(path, code);
    const said = judgePython(LOOPER, [path]);
    if (said.kind !== "found") return [`the reader did not answer: ${said.detail}`];
    return said.hits.map((hit) => hit.rule);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("every Python case agrees with the rule it was written from", () => {
  const wrong: string[] = [];
  for (const held of PYTHON_CASES) {
    const fired = firedOn(held.code).includes(held.rule);
    if (fired !== (held.expect === "fires")) {
      wrong.push(`${held.rule}  ${held.name}  (wanted ${held.expect}, got ${fired ? "fires" : "silent"})`);
    }
  }
  assert.deepEqual(wrong, [], `${wrong.length} of ${PYTHON_CASES.length} cases disagree with their rule`);
});

test("a file that is not Python is named rather than passed as clean", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-py-"));
  try {
    const path = join(root, "broken.py");
    writeFileSync(path, "def f(:\n");
    const said = judgePython(LOOPER, [path]);

    assert.equal(said.kind, "found");
    if (said.kind !== "found") return;
    assert.equal(
      said.unreadable.length,
      1,
      "a file the reader cannot parse was reported as having nothing wrong with it, which is not the same as being clean",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
