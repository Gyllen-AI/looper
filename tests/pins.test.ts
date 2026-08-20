import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Pins } from "../src/pins/capability.ts";
import { gitIn as git } from "./helpers.ts";

const ALLOW_FILE_URLS = ["-c", "protocol.file.allow=always"];

type Built = {
  readonly root: string;
  readonly parent: string;
  readonly sub: string;
  readonly work: string;
};

function identify(where: string): void {
  git(where, "config", "user.email", "t@example.com");
  git(where, "config", "user.name", "t");
}

function commitIn(where: string, name: string, text: string): void {
  writeFileSync(join(where, name), text);
  git(where, "add", "-A");
  git(where, "commit", "-qm", text);
}

function built(): Built {
  const root = mkdtempSync(join(tmpdir(), "looper-pins-"));
  const origin = join(root, "origin");
  const parent = join(root, "parent");
  const work = join(root, "work");
  mkdirSync(origin);
  mkdirSync(parent);

  git(origin, "init", "-q", "--bare", "-b", "main");
  git(root, "clone", "-q", origin, "work");
  identify(work);
  commitIn(work, "a.txt", "one");
  commitIn(work, "b.txt", "two");
  git(work, "push", "-q", "origin", "main");

  git(parent, "init", "-q", "-b", "main");
  identify(parent);
  git(parent, ...ALLOW_FILE_URLS, "submodule", "add", "-q", origin, "sub");
  git(parent, "commit", "-qm", "the submodule arrives");

  return { root, parent, sub: join(parent, "sub"), work };
}

function verdictOn(parent: string) {
  return new Pins().onHook({ root: parent, event: "PreCommit", payload: { kind: "none" } });
}

function stagePin(parent: string): void {
  git(parent, "add", "sub");
}

test("a pin moved onto the submodule's own main is left alone", () => {
  const made = built();
  try {
    commitIn(made.work, "c.txt", "three");
    git(made.work, "push", "-q", "origin", "main");
    git(made.sub, "fetch", "-q", "origin");
    git(made.sub, "checkout", "-q", "origin/main");
    stagePin(made.parent);

    assert.equal(verdictOn(made.parent).kind, "pass");
  } finally {
    rmSync(made.root, { recursive: true, force: true });
  }
});

test("a pin moved onto a commit that never left this machine is refused", () => {
  const made = built();
  try {
    identify(made.sub);
    commitIn(made.sub, "mine.txt", "never pushed");
    stagePin(made.parent);

    const verdict = verdictOn(made.parent);
    assert.equal(verdict.kind, "block");
    if (verdict.kind !== "block") return;
    assert.ok(verdict.reason.includes("sub"));
    assert.ok(verdict.reason.includes("origin/main"));
    assert.ok(verdict.reason.includes("git restore --staged"));
  } finally {
    rmSync(made.root, { recursive: true, force: true });
  }
});

test("a pin the remote still serves but no branch names is refused, which is the closed pull request", () => {
  const made = built();
  try {
    git(made.work, "checkout", "-q", "-b", "aside");
    commitIn(made.work, "d.txt", "on a branch that will be deleted");
    git(made.work, "push", "-q", "origin", "HEAD:refs/pull/1/head");
    git(made.work, "checkout", "-q", "main");

    git(made.sub, "fetch", "-q", "origin", "refs/pull/1/head");
    git(made.sub, "checkout", "-q", "FETCH_HEAD");
    stagePin(made.parent);

    const verdict = verdictOn(made.parent);
    assert.equal(verdict.kind, "block");
    if (verdict.kind !== "block") return;
    assert.ok(verdict.reason.includes("is not a tag"));
  } finally {
    rmSync(made.root, { recursive: true, force: true });
  }
});

test("a pin moved onto a tag off the default branch is left alone", () => {
  const made = built();
  try {
    git(made.work, "checkout", "-q", "-b", "release");
    commitIn(made.work, "e.txt", "a release that is not on main");
    git(made.work, "tag", "v1.0.0");
    git(made.work, "push", "-q", "origin", "v1.0.0");
    git(made.work, "checkout", "-q", "main");

    git(made.sub, "fetch", "-q", "origin", "--tags");
    git(made.sub, "checkout", "-q", "v1.0.0");
    stagePin(made.parent);

    assert.equal(verdictOn(made.parent).kind, "pass");
  } finally {
    rmSync(made.root, { recursive: true, force: true });
  }
});

test("a commit that moves no pin is never spoken to", () => {
  const made = built();
  try {
    writeFileSync(join(made.parent, "note.md"), ":160000 160000 aaaaaaa bbbbbbb M\tsub\n");
    git(made.parent, "add", "-A");

    assert.equal(verdictOn(made.parent).kind, "pass");
  } finally {
    rmSync(made.root, { recursive: true, force: true });
  }
});

test("a pin whose submodule is not checked out is refused rather than assumed", () => {
  const made = built();
  try {
    identify(made.sub);
    commitIn(made.sub, "mine.txt", "never pushed");
    stagePin(made.parent);
    rmSync(made.sub, { recursive: true, force: true });

    const verdict = verdictOn(made.parent);
    assert.equal(verdict.kind, "block");
    if (verdict.kind !== "block") return;
    assert.ok(verdict.reason.includes("not checked out"));
  } finally {
    rmSync(made.root, { recursive: true, force: true });
  }
});
