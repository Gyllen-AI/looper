import { first } from "./helpers.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Law } from "../src/law/capability.ts";
import { dispatchHook } from "../src/registry.ts";
import { surveyProject } from "../src/law/project.ts";

const BROKEN = `export function find( {
  try {
    return db.get(id);
  } catch {
    return null;
  }
  const loose = value as any;
`;

function project(): string {
  const root = mkdtempSync(join(tmpdir(), "looper-unjudged-"));
  mkdirSync(join(root, "src"), { recursive: true });
  return root;
}

function judgeEdit(root: string, payload: string) {
  return dispatchHook([new Law()], {
    root,
    event: "PostToolUse",
    payload: { kind: "text", text: payload },
  });
}

function editOf(root: string, file: string): string {
  return JSON.stringify({ tool_name: "Edit", tool_input: { file_path: join(root, file) } });
}

test("a file that cannot be read as TypeScript is never called clean", () => {
  const root = project();
  try {
    writeFileSync(join(root, "src/broken.ts"), BROKEN);
    const survey = surveyProject(root, "everything");

    assert.notEqual(
      survey.violations.length,
      0,
      "a file with a syntax error was surveyed and reported as having nothing wrong",
    );
    const said = survey.violations.map((held) => held.rule.id);
    assert.ok(said.includes("TS-ERROR:8"), `expected TS-ERROR:8, got ${said.join(", ")}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the edit gate refuses a file it could not read, naming the line", () => {
  const root = project();
  try {
    writeFileSync(join(root, "src/broken.ts"), BROKEN);
    const result = judgeEdit(root, editOf(root, "src/broken.ts"));

    assert.equal(result.refusals.length, 1);
    const reason = first(result.refusals).reason;
    assert.ok(reason.includes("TS-ERROR:8"), reason.slice(0, 200));
    assert.ok(reason.includes("src/broken.ts:"), reason.slice(0, 200));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a payload the gate cannot read is said out loud, not passed in silence", () => {
  const root = project();
  try {
    for (const payload of [
      '{"tool_name":"Edit","tool_input":{"file_path":"/x/y.ts"}',
      '{"tool_name":"Edit","toolinput":{"file_path":"/x/y.ts"}}',
      '{"tool_name":"Edit","tool_input":{"file_path":42}}',
    ]) {
      const result = judgeEdit(root, payload);
      assert.equal(result.refusals.length, 0, "an unreadable payload must not wedge the session");
      assert.notEqual(
        result.mentions.length,
        0,
        `the gate passed in silence on: ${payload}`,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
