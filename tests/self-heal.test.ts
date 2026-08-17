import { first } from "./helpers.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Law } from "../src/law/capability.ts";
import { runInit } from "../src/init.ts";
import { dispatchHook } from "../src/registry.ts";

const LEGACY = `export async function load(id: string) {
  const base = process.env.API_URL;
  console.log("loading", id);
  try {
    return await fetch(base + id);
  } catch {
    return [];
  }
}

export function rate() {
  return 0.2;
}
`;

function adopted(): string {
  const root = mkdtempSync(join(tmpdir(), "looper-heal-"));
  mkdirSync(join(root, "src"), { recursive: true });
  const git = (...args: readonly string[]) =>
    execFileSync("git", [...args], { cwd: root, stdio: "ignore" });
  git("init", "-q");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t" }));
  writeFileSync(join(root, "src/orders.ts"), LEGACY);
  git("add", "-A");
  git("commit", "-qm", "before");
  runInit(root, "installed");
  git("add", "-A");
  git("commit", "-qm", "adopt");
  return root;
}

function afterEditing(root: string, text: string) {
  writeFileSync(join(root, "src/orders.ts"), text);
  return dispatchHook([new Law()], {
    root,
    event: "PostToolUse",
    payload: {
      kind: "text",
      text: JSON.stringify({
        tool_name: "Edit",
        tool_input: { file_path: join(root, "src/orders.ts") },
      }),
    },
  });
}

test("changing an untouched part of an old file is not turned into a refactor", () => {
  const root = adopted();
  try {
    const result = afterEditing(root, LEGACY.replace("return 0.2;", "return 0.25;"));

    assert.deepEqual(
      [...result.refusals],
      [],
      "a one-line change must not demand the whole file be fixed, or nobody keeps the tool",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("but it is told what else is in the file, so the file can heal", () => {
  const root = adopted();
  try {
    const result = afterEditing(root, LEGACY.replace("return 0.2;", "return 0.25;"));

    assert.equal(result.mentions.length, 1);
    const note = first(result.mentions).note;
    assert.ok(note.includes("TS-LOG:1"), "it names what is there");
    assert.ok(note.includes("line"), "and where");
    assert.ok(note.includes("Nothing is blocked"));
    assert.ok(note.includes("cheapest"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("touching a line that has a problem does demand that one, and only that one", () => {
  const root = adopted();
  try {
    const result = afterEditing(root, LEGACY.replace('"loading"', '"loading now"'));

    assert.equal(result.refusals.length, 1);
    const reason = first(result.refusals).reason;
    assert.ok(reason.includes("TS-LOG:1"), "the one on the line touched");
    assert.ok(!reason.includes("TS-TRUTH:2"), "not the ones left alone");
    assert.ok(reason.includes("also has"), "though it still says what else is here");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a brand new problem is demanded in full, baseline or not", () => {
  const root = adopted();
  try {
    const result = afterEditing(root, `${LEGACY}\nexport function f() {\n  try { g() } catch { return null }\n}\n`);

    assert.equal(result.refusals.length, 1);
    assert.ok(first(result.refusals).reason.includes("TS-ERROR:3"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a file with nothing outstanding says nothing at all", () => {
  const root = adopted();
  try {
    writeFileSync(join(root, "src/clean.ts"), "export const rate = 0.25;\n");
    const result = dispatchHook([new Law()], {
      root,
      event: "PostToolUse",
      payload: {
        kind: "text",
        text: JSON.stringify({
          tool_name: "Edit",
          tool_input: { file_path: join(root, "src/clean.ts") },
        }),
      },
    });

    assert.deepEqual([...result.refusals], []);
    assert.deepEqual([...result.mentions], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
