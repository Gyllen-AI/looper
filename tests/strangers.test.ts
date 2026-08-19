import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Secrets } from "../src/secrets/capability.ts";
import { dispatchHook } from "../src/registry.ts";
import { intentOf } from "../src/law/commit-command.ts";
import { gitIn as git } from "./helpers.ts";

function repoWithARemote(): string {
  const bare = mkdtempSync(join(tmpdir(), "looper-remote-"));
  git(bare, "init", "-q", "--bare");
  const root = mkdtempSync(join(tmpdir(), "looper-strangers-"));
  mkdirSync(join(root, "docs"), { recursive: true });
  git(root, "init", "-q");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "t");
  writeFileSync(join(root, "docs/plan.md"), "The gate reads the staged text.\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "first");
  git(root, "remote", "add", "origin", bare);
  git(root, "push", "-q", "-u", "origin", "HEAD");
  return root;
}

function pushing(root: string) {
  return dispatchHook([new Secrets()], {
    root,
    event: "PreToolUse",
    payload: {
      kind: "text",
      text: JSON.stringify({ tool_name: "Bash", tool_input: { command: "git push" } }),
    },
  });
}

function said(run: ReturnType<typeof pushing>): string {
  return [...run.refusals.map((one) => one.reason), ...run.mentions.map((one) => one.note)].join("\n");
}

test("a push is read as a push", () => {
  assert.equal(intentOf("git push").kind, "push");
  assert.equal(intentOf("git push -u origin HEAD").kind, "push");
  assert.equal(intentOf("git commit -m x && git push").kind, "commit");
  assert.equal(intentOf("npm run push").kind, "other");
});

test("a word that appears nowhere else in the repository is named before it leaves", () => {
  const root = repoWithARemote();
  try {
    writeFileSync(join(root, "docs/plan.md"), "The gate reads Base.API and BaseWeb.\n");
    git(root, "add", "-A");
    git(root, "commit", "-qm", "second");

    const spoken = said(pushing(root));
    assert.ok(
      spoken.includes("BaseWeb"),
      `adopter issue #97: a grep for the words somebody thought of reported clean, and three directory names nobody had pictured went to a public repository.\n${spoken}`,
    );
    assert.ok(spoken.includes("docs/plan.md"), spoken);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a push carrying only words this repository already knows says nothing", () => {
  const root = repoWithARemote();
  try {
    writeFileSync(join(root, "docs/plan.md"), "The gate reads the staged text.\nThe gate reads the text.\n");
    git(root, "add", "-A");
    git(root, "commit", "-qm", "second");

    assert.equal(said(pushing(root)), "", "every word was already in the repository");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a repository with nothing to compare against says so rather than staying quiet", () => {
  const root = mkdtempSync(join(tmpdir(), "looper-noremote-"));
  try {
    git(root, "init", "-q");
    git(root, "config", "user.email", "t@example.com");
    git(root, "config", "user.name", "t");
    writeFileSync(join(root, "a.md"), "one\n");
    git(root, "add", "-A");
    git(root, "commit", "-qm", "only");

    const spoken = said(pushing(root));
    assert.ok(
      spoken.includes("not checked"),
      `silence is indistinguishable from approval, which is the whole complaint in #97\n${spoken}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
