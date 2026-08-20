import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { changedPaths } from "../src/git.ts";
import { gitIn as git } from "./helpers.ts";

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "looper-changed-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "t");
  writeFileSync(join(root, "base.ts"), "base\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "base");
  return root;
}

function commit(root: string, name: string): void {
  writeFileSync(join(root, name), "x\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", name);
}

function pathsIn(root: string): readonly string[] {
  const changed = changedPaths(root);
  return changed.kind === "paths" ? changed.paths : [];
}

test("what you are touching now outranks what you finished a moment ago", () => {
  const root = repo();
  try {
    commit(root, "finished.ts");
    writeFileSync(join(root, "starting.ts"), "y\n");

    const paths = pathsIn(root);

    assert.deepEqual(
      [...paths],
      ["starting.ts"],
      "the last commit's files were counted as current work, so the rules that arrive are for what was just put down rather than what is in hand",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a clean tree falls back to the last commit, because continuing is the likeliest thing", () => {
  const root = repo();
  try {
    commit(root, "finished.ts");

    assert.deepEqual([...pathsIn(root)], ["finished.ts"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an edit to a tracked file counts, not only a new one", () => {
  const root = repo();
  try {
    commit(root, "one.ts");
    commit(root, "two.ts");
    writeFileSync(join(root, "one.ts"), "changed\n");

    assert.deepEqual([...pathsIn(root)], ["one.ts"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
