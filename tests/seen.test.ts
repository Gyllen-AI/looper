import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { lastRun, noteRun, sayWhenHooksRan, seenPath, sessionEverRan, worthSayingAtCommit } from "../src/seen.ts";

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "looper-seen-"));
}

function said(root: string, home: string): string {
  return sayWhenHooksRan(lastRun(root, home)).join(" ");
}

const A_TUESDAY = "2026-08-18T09:14:05.000Z";
const LATER = "2026-08-18T11:00:00.000Z";

test("a project no hook has ever run in says so, rather than nothing", () => {
  const home = scratch();
  const root = scratch();
  try {
    assert.deepEqual(lastRun(root, home), { last: null, session: null, trouble: "" });
    assert.match(said(root, home), /never/);
  } finally {
    for (const path of [home, root]) rmSync(path, { recursive: true, force: true });
  }
});

test("a hook that ran is remembered with the folder the agent started in", () => {
  const home = scratch();
  const root = scratch();
  try {
    noteRun(root, home, { event: "UserPromptSubmit", startedIn: root, at: A_TUESDAY });
    const seen = lastRun(root, home);

    assert.deepEqual(seen.last, { event: "UserPromptSubmit", startedIn: root, at: A_TUESDAY });
    assert.ok(sessionEverRan(seen));
    assert.ok(said(root, home).includes(root), "the folder the agent started in is not reported");
  } finally {
    for (const path of [home, root]) rmSync(path, { recursive: true, force: true });
  }
});

test("a git hook reaching looper is not mistaken for a session, which is the half-working state", () => {
  const home = scratch();
  const root = scratch();
  try {
    noteRun(root, home, { event: "PreCommit", startedIn: "", at: A_TUESDAY });
    const seen = lastRun(root, home);

    assert.equal(sessionEverRan(seen), false, "a run with no agent behind it is not a session run");
    assert.match(said(root, home), /PreCommit/);
    assert.match(said(root, home), /outside an agent session/);
    assert.doesNotMatch(said(root, home), /undefined|null/);
  } finally {
    for (const path of [home, root]) rmSync(path, { recursive: true, force: true });
  }
});

test("a session that once ran is not forgotten by the git hooks that run after it", () => {
  const home = scratch();
  const root = scratch();
  try {
    noteRun(root, home, { event: "PostToolUse", startedIn: root, at: A_TUESDAY });
    noteRun(root, home, { event: "PreCommit", startedIn: "", at: LATER });
    const seen = lastRun(root, home);

    assert.ok(sessionEverRan(seen), "the session run was overwritten by a commit");
    assert.equal(seen.last?.event, "PreCommit");
    assert.match(said(root, home), /last session run/);
  } finally {
    for (const path of [home, root]) rmSync(path, { recursive: true, force: true });
  }
});

test("the record is kept per machine, not in the project, so a teammate is told the truth about their own", () => {
  const mine = scratch();
  const theirs = scratch();
  const root = scratch();
  try {
    noteRun(root, mine, { event: "PostToolUse", startedIn: root, at: A_TUESDAY });

    assert.ok(sessionEverRan(lastRun(root, mine)));
    assert.deepEqual(
      lastRun(root, theirs),
      { last: null, session: null, trouble: "" },
      "a clone on another machine has run nothing, and must not inherit the author's record",
    );
  } finally {
    for (const path of [mine, theirs, root]) rmSync(path, { recursive: true, force: true });
  }
});

test("two projects on one machine are remembered apart", () => {
  const home = scratch();
  const one = scratch();
  const other = scratch();
  try {
    noteRun(one, home, { event: "Stop", startedIn: one, at: A_TUESDAY });

    assert.ok(lastRun(one, home).last !== null);
    assert.equal(lastRun(other, home).last, null);
  } finally {
    for (const path of [home, one, other]) rmSync(path, { recursive: true, force: true });
  }
});

test("the newest run replaces the one before it", () => {
  const home = scratch();
  const root = scratch();
  try {
    noteRun(root, home, { event: "UserPromptSubmit", startedIn: root, at: A_TUESDAY });
    noteRun(root, home, { event: "PreToolUse", startedIn: root, at: LATER });
    const seen = lastRun(root, home);

    assert.equal(seen.last?.at, LATER);
    assert.equal(seen.last?.event, "PreToolUse");
  } finally {
    for (const path of [home, root]) rmSync(path, { recursive: true, force: true });
  }
});

test("a record damaged on disk hands the failure back rather than throwing in a hook", () => {
  const home = scratch();
  const root = scratch();
  try {
    noteRun(root, home, { event: "Stop", startedIn: root, at: A_TUESDAY });
    writeFileSync(seenPath(root, home), "{ this is not json");
    const seen = lastRun(root, home);

    assert.equal(seen.last, null);
    assert.ok(seen.trouble.length > 0, "a damaged record must hand the failure back, not swallow it");
    assert.match(said(root, home), /could not be read/);
  } finally {
    for (const path of [home, root]) rmSync(path, { recursive: true, force: true });
  }
});

test("a commit says the session hooks are dead, once that is true, and not otherwise", () => {
  const home = scratch();
  const root = scratch();
  try {
    assert.ok(
      worthSayingAtCommit("PreCommit", "", lastRun(root, home)),
      "a commit in a project no session has ever reached must say so — it is the only path still running",
    );

    noteRun(root, home, { event: "PreCommit", startedIn: "", at: A_TUESDAY });
    assert.ok(worthSayingAtCommit("CommitMessage", "", lastRun(root, home)), "committing is not a session");

    noteRun(root, home, { event: "UserPromptSubmit", startedIn: root, at: LATER });
    assert.equal(
      worthSayingAtCommit("PreCommit", "", lastRun(root, home)),
      false,
      "once a session has reached looper the notice must stop, or it is nagging",
    );
  } finally {
    for (const path of [home, root]) rmSync(path, { recursive: true, force: true });
  }
});

test("a session hook does not carry the commit notice, because a session can see everything else looper says", () => {
  const home = scratch();
  const root = scratch();
  try {
    assert.equal(worthSayingAtCommit("PostToolUse", root, lastRun(root, home)), false);
    assert.equal(worthSayingAtCommit("UserPromptSubmit", root, lastRun(root, home)), false);
  } finally {
    for (const path of [home, root]) rmSync(path, { recursive: true, force: true });
  }
});
