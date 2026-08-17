import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Law } from "../src/law/capability.ts";
import { preCommitScript } from "../src/config.ts";
import { gitIn as git } from "./helpers.ts";
import { runInit } from "../src/init.ts";

const BROKEN = "export function f() {\n  try { g() } catch { return null }\n}\n";

function started(): string {
  const root = mkdtempSync(join(tmpdir(), "looper-pc-"));
  mkdirSync(join(root, "src"), { recursive: true });
  git(root, "init", "-q");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "t");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t" }));
  writeFileSync(join(root, "src/a.ts"), "export const rate = 0.2;\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "before");
  return root;
}

function verdictOn(root: string) {
  return new Law().onHook({ root, event: "PreCommit", payload: { kind: "none" } });
}

test("init installs the hook where git already looks", () => {
  const root = started();
  try {
    const report = runInit(root, "installed");

    assert.ok(report.steps.some((step) => step.kind === "gate-wired"));
    assert.equal(report.commitGate, "wired");
    assert.ok(existsSync(join(root, ".git/hooks/pre-commit")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the commit check reads staged files, not a payload it was never given", () => {
  const root = started();
  try {
    runInit(root, "installed");
    writeFileSync(join(root, "src/bad.ts"), BROKEN);
    git(root, "add", "-A");

    const outcome = verdictOn(root);
    assert.equal(
      outcome.kind,
      "block",
      "a git hook is run with empty stdin on purpose, so an empty payload must not mean pass",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a clean staged change passes the commit check", () => {
  const root = started();
  try {
    runInit(root, "installed");
    writeFileSync(join(root, "src/b.ts"), "export const vat = 0.25;\n");
    git(root, "add", "-A");

    assert.equal(verdictOn(root).kind, "pass");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a hook the project already wrote is never overwritten", () => {
  const root = started();
  try {
    const path = join(root, ".git/hooks/pre-commit");
    writeFileSync(path, "#!/bin/sh\ntheir-own-check\n");
    chmodSync(path, 0o755);

    const report = runInit(root, "installed");

    assert.equal(readFileSync(path, "utf8"), "#!/bin/sh\ntheir-own-check\n");
    assert.equal(report.commitGate, "not-wired");
    const step = report.steps.find((held) => held.kind === "gate-yours");
    assert.ok(step !== undefined, "and it says so, rather than reporting success");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("running init twice does not wire it twice", () => {
  const root = started();
  try {
    runInit(root, "installed");
    const second = runInit(root, "installed");

    assert.ok(second.steps.some((step) => step.kind === "gate-already"));
    assert.equal(second.commitGate, "wired");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("only a real verdict blocks; anything else lets the commit through", () => {
  const script = preCommitScript("looper");

  assert.ok(script.includes("-eq 2"), "a verdict of 2 is the only thing that refuses");
  assert.ok(script.includes("-ne 0"), "and every other failure passes");
  assert.ok(script.includes("could not check this commit"));
  assert.ok(
    !script.includes("$CLAUDE_PROJECT_DIR"),
    "a git hook runs from the shell, where that is not set",
  );
});

test("outside a git repository there is nothing to wire, and it says so", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-nogit-"));
  try {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t" }));
    const report = runInit(root, "installed");

    assert.equal(report.commitGate, "not-wired");
    assert.ok(report.steps.some((step) => step.kind === "gate-impossible"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
