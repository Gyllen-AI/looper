import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { CSHARP_CASES } from "../audit/csharp-cases.ts";
import { judgeCsharp } from "../src/law/csharp/drive.ts";

const LOOPER = join(import.meta.dirname, "..");

function firedOn(code: string, named: string | undefined): readonly string[] {
  const root = mkdtempSync(join(tmpdir(), "looper-cs-"));
  try {
    const path = join(root, named === undefined ? "Held.cs" : named);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, code);
    const said = judgeCsharp(LOOPER, root, [path]);
    if (said.kind !== "found") return [`the reader did not answer: ${said.detail}`];
    return said.hits.map((hit) => hit.rule);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("every C# case agrees with the rule it was written from", () => {
  const wrong: string[] = [];
  for (const held of CSHARP_CASES) {
    const fired = firedOn(held.code, held.file).includes(held.rule);
    if (fired !== (held.expect === "fires")) {
      wrong.push(`${held.rule}  ${held.name}  (wanted ${held.expect}, got ${fired ? "fires" : "silent"})`);
    }
  }
  assert.deepEqual(wrong, [], `${wrong.length} of ${CSHARP_CASES.length} cases disagree with their rule`);
});

test("a line number points at the line somebody has to open", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-cs-"));
  try {
    const path = join(root, "Held.cs");
    writeFileSync(path, `class C {\n    void F() {\n        try { G(); } catch { }\n    }\n    void G() { }\n}\n`);
    const said = judgeCsharp(LOOPER, root, [path]);
    assert.equal(said.kind, "found");
    if (said.kind !== "found") return;
    assert.deepEqual(
      said.hits.map((hit) => [hit.rule, hit.line]),
      [["CS-ERROR:1", 3]],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a Razor line number counts from the top of the Razor file, not the code block", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-cs-"));
  try {
    const path = join(root, "Held.razor");
    writeFileSync(
      path,
      `<div>one</div>\n<div>two</div>\n<div>three</div>\n\n@code {\n    void F() {\n        try { G(); } catch { }\n    }\n\n    void G() { }\n}\n`,
    );
    const said = judgeCsharp(LOOPER, root, [path]);
    assert.equal(said.kind, "found");
    if (said.kind !== "found") return;
    assert.deepEqual(
      said.hits.map((hit) => [hit.rule, hit.line]),
      [["CS-ERROR:1", 7]],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a line number for the ! points at the ! and not at where its expression began", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-cs-"));
  try {
    const path = join(root, "Held.cs");
    writeFileSync(
      path,
      `using System.Reflection;\nclass C {\n    void F(object held) {\n        var found = typeof(C)\n            .GetField("x", BindingFlags.NonPublic)!\n            .GetValue(held)!;\n    }\n}\n`,
    );
    const said = judgeCsharp(LOOPER, root, [path]);
    assert.equal(said.kind, "found");
    if (said.kind !== "found") return;
    assert.deepEqual(
      said.hits.filter((hit) => hit.rule === "CS-TYPE:1").map((hit) => hit.line),
      [5, 6],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a file that will not parse is named rather than passed as clean", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-cs-"));
  try {
    const path = join(root, "Held.cs");
    writeFileSync(path, `class C { void F() { try { G(); } catch { }\n`);
    const said = judgeCsharp(LOOPER, root, [path]);
    assert.equal(said.kind, "found");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
