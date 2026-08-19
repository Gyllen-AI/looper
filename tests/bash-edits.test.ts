import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Law } from "../src/law/capability.ts";
import { dispatchHook } from "../src/registry.ts";
import { runInit } from "../src/init.ts";
import { INSTALLED } from "../src/config.ts";
import { gitIn as git } from "./helpers.ts";

const NO_PATH: readonly string[] = [];

function project(): string {
  const root = mkdtempSync(join(tmpdir(), "looper-bash-"));
  mkdirSync(join(root, "src"), { recursive: true });
  git(root, "init", "-q");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "t");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t" }));
  writeFileSync(join(root, "src/one.ts"), "export const one = 1;\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "before looper");
  runInit(root, INSTALLED, NO_PATH);
  git(root, "add", "-A");
  git(root, "commit", "-qm", "adopt looper");
  return root;
}

function ran(root: string, event: "PreToolUse" | "PostToolUse", command: string) {
  return dispatchHook([new Law()], {
    root,
    event,
    payload: {
      kind: "text",
      text: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    },
  });
}

test("a file written through Bash is judged, not left for the commit", () => {
  const root = project();
  try {
    ran(root, "PreToolUse", "python3 - <<'PY'\nopen('src/two.ts','w')\nPY");
    writeFileSync(join(root, "src/two.ts"), "export function f(a) { try { g(a); } catch {} }\n");

    const said = ran(root, "PostToolUse", "python3 - <<'PY'\nopen('src/two.ts','w')\nPY");
    const spoken = [...said.refusals.map((one) => one.reason), ...said.mentions.map((one) => one.note)].join("\n");

    assert.ok(
      spoken.includes("src/two.ts"),
      `adopter issue #95: five files written by one heredoc carried nine new blocking problems and looper said nothing, because PostToolUse matched Edit|MultiEdit|Write only. The commit gate would have caught them, but as nine at once, long after the reasoning that produced them.\n${spoken}`,
    );
    assert.ok(spoken.includes("TS-ERROR"), spoken);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a command that changed nothing says nothing", () => {
  const root = project();
  try {
    ran(root, "PreToolUse", "ls -la");
    const said = ran(root, "PostToolUse", "ls -la");
    assert.deepEqual([...said.refusals], []);
    assert.deepEqual([...said.mentions], [], "a command that touched no file must not speak");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a file changed by an earlier command is not judged again by a later one", () => {
  const root = project();
  try {
    ran(root, "PreToolUse", "first");
    writeFileSync(join(root, "src/two.ts"), "export function f(a) { try { g(a); } catch {} }\n");
    const first = ran(root, "PostToolUse", "first");
    assert.ok([...first.refusals.map((one) => one.reason), ...first.mentions.map((one) => one.note)].join("").includes("src/two.ts"));

    ran(root, "PreToolUse", "second");
    const second = ran(root, "PostToolUse", "second");
    assert.deepEqual(
      [...second.refusals, ...second.mentions],
      [],
      "the same problem reported after every later command is the reason this cannot simply judge everything git calls dirty",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
