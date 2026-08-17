import { first } from "./helpers.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { intentOf } from "../src/law/commit-command.ts";
import { Law, aboutToCommit } from "../src/law/capability.ts";
import { dispatchHook } from "../src/registry.ts";

const GUILTY = `export function find(id: string) {
  try {
    return db.get(id);
  } catch {
    return null;
  }
}
`;

function bashPayload(command: string): string {
  return JSON.stringify({ tool_name: "Bash", tool_input: { command } });
}

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "looper-commit-"));
  mkdirSync(join(root, "src"), { recursive: true });
  const git = (...args: readonly string[]) =>
    execFileSync("git", [...args], { cwd: root, stdio: "ignore" });
  git("init", "-q");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t" }));
  return root;
}

function stage(root: string, file: string, text: string): void {
  writeFileSync(join(root, file), text);
  execFileSync("git", ["add", file], { cwd: root, stdio: "ignore" });
}

function tryCommit(root: string, command: string) {
  return dispatchHook([new Law()], {
    root,
    event: "PreToolUse",
    payload: { kind: "text", text: bashPayload(command) },
  });
}

test("a commit is recognised however it is written", () => {
  for (const command of [
    "git commit -m 'x'",
    "git commit --amend --no-edit",
    "git -C /some/path commit -m 'x'",
    "git add -A && git commit -m 'x'",
    "npm test; git commit -m 'x'",
    "GIT_AUTHOR_NAME=x git commit -m 'x'",
    "git commit --no-verify -m 'x'",
  ]) {
    assert.equal(intentOf(command).kind, "commit", command);
  }
});

test("something that merely mentions committing is not a commit", () => {
  for (const command of [
    "echo 'git commit -m x'",
    "git status",
    "git add -A",
    "git log --oneline",
    "grep -r 'git commit' .",
    "git config --get user.name",
  ]) {
    assert.equal(intentOf(command).kind, "other", command);
  }
});

test("a payload with no command in it is not a commit", () => {
  assert.equal(aboutToCommit("{}"), false);
  assert.equal(aboutToCommit("{ not json"), false);
  assert.equal(aboutToCommit(JSON.stringify({ tool_input: {} })), false);
});

test("staged code that breaks a rule refuses the commit", () => {
  const root = repo();
  try {
    stage(root, "src/user.ts", GUILTY);
    const result = tryCommit(root, "git commit -m 'add user lookup'");

    assert.equal(result.refusals.length, 1);
    const reason = first(result.refusals).reason;
    assert.ok(reason.includes("TS-ERROR:3"));
    assert.ok(reason.includes("src/user.ts"));
    assert.ok(reason.includes("Nothing was committed."));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("--no-verify does not get past this gate, because it is not a git hook", () => {
  const root = repo();
  try {
    stage(root, "src/user.ts", GUILTY);
    assert.equal(tryCommit(root, "git commit --no-verify -m 'x'").refusals.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("what is judged is what is staged, not what is on disk", () => {
  const root = repo();
  try {
    stage(root, "src/user.ts", GUILTY);
    writeFileSync(join(root, "src/user.ts"), "export const clean = 1;\n");

    assert.equal(
      tryCommit(root, "git commit -m 'x'").refusals.length,
      1,
      "the staged version is what would be committed, so it is what gets judged",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a clean commit is not interrupted", () => {
  const root = repo();
  try {
    stage(root, "src/user.ts", "export const total = 1;\n");
    assert.deepEqual([...tryCommit(root, "git commit -m 'x'").refusals], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("any other command passes untouched", () => {
  const root = repo();
  try {
    stage(root, "src/user.ts", GUILTY);
    assert.deepEqual([...tryCommit(root, "npm test").refusals], []);
    assert.deepEqual([...tryCommit(root, "git status").refusals], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("outside a git repository the gate stays quiet rather than guessing", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-nogit-"));
  try {
    assert.deepEqual([...tryCommit(root, "git commit -m 'x'").refusals], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
