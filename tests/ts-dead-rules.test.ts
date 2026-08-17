import { test } from "node:test";
import assert from "node:assert/strict";

import { CONCEDING_NOTHING } from "../src/law/concessions.ts";
import { judge, type Check } from "../src/law/engine.ts";
import { commentCheck } from "../src/law/ts/comment.ts";
import { fileLengthCheck } from "../src/law/ts/file-length.ts";

function foundAtCap(check: Check, text: string, maxLoc: number) {
  return judge(
    [check],
    "fast",
    { file: "src/a.ts", text },
    { ...CONCEDING_NOTHING, maxLoc },
  ).violations;
}

function found(check: Check, text: string) {
  return foundAtCap(check, text, 500);
}


test("every kind of comment is caught, documentation included", () => {
  for (const written of [
    "// a line comment\nconst a = 1;",
    "/* a block comment */\nconst a = 1;",
    "/** documentation */\nexport function f() {}",
    "const a = 1; // trailing",
  ]) {
    assert.equal(found(commentCheck, written).length, 1, written);
  }
});

test("the comment is reported where it sits, not where the code is", () => {
  const violations = found(commentCheck, "const a = 1;\nconst b = 2;\n// here\nconst c = 3;\n");
  assert.equal(violations[0]?.line, 3);
});

test("a shebang is how a file is run, not a comment about it", () => {
  assert.deepEqual([...found(commentCheck, "#!/usr/bin/env node\nconst a = 1;\n")], []);
});

test("something that looks like a comment inside a string is left alone", () => {
  assert.deepEqual([...found(commentCheck, 'const url = "https://example.com/a";')], []);
  assert.deepEqual([...found(commentCheck, 'const a = "/* not a comment */";')], []);
});

test("code with no comments passes, which is the point", () => {
  assert.deepEqual(
    [...found(commentCheck, "export function total(lines: readonly Line[]): number {\n  return lines.reduce(sum, 0);\n}\n")],
    [],
  );
});

test("a file over the cap is reported at the first line past it", () => {
  const violations = foundAtCap(fileLengthCheck, "const a = 1;\n".repeat(20), 10);
  assert.equal(violations.length, 1);
  assert.equal(
    violations[0]?.line,
    11,
    "line 0 does not exist, so the reference in the report went nowhere",
  );
});

test("a file at the cap exactly is not over it", () => {
  assert.deepEqual([...foundAtCap(fileLengthCheck, "a\n".repeat(9), 10)], []);
});

test("the cap is a knob and moving it changes the verdict", () => {
  const text = "a\n".repeat(50);
  assert.equal(foundAtCap(fileLengthCheck, text, 10).length, 1);
  assert.deepEqual([...foundAtCap(fileLengthCheck, text, 500)], []);
});

test("the message says where to argue with the cap", () => {
  const violations = foundAtCap(fileLengthCheck, "a\n".repeat(20), 10);
  assert.equal(violations[0]?.rule.valve.kind, "knob");
});
