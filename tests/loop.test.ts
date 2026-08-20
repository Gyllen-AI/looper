import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { declaredIn, LOOP_FILE, PATIENCE_SECONDS } from "../src/loop/checks.ts";
import { ask, tallyOf, verdictOf, BLIND_EXIT, type Seen } from "../src/loop/run.ts";
import { Loop } from "../src/loop/capability.ts";
import { keep } from "../src/loop/cache.ts";
import type { Outcome } from "../src/capability.ts";

function project(loopToml: string | null): string {
  const root = mkdtempSync(join(tmpdir(), "looper-loop-"));
  mkdirSync(join(root, ".looper"), { recursive: true });
  if (loopToml !== null) writeFileSync(join(root, LOOP_FILE), loopToml);
  return root;
}

test("a project that declares nothing is not an error", () => {
  const root = project(null);
  const declared = declaredIn(root);
  assert.equal(declared.checks.length, 0);
  assert.equal(declared.complaints.length, 0);
  rmSync(root, { recursive: true, force: true });
});

test("the section name is the label, so a label cannot be written twice", () => {
  const root = project(`[loop.one]\nreach = "internal"\nrun = "true"\n\n[loop.one]\nreach = "external"\nrun = "false"\n`);
  const declared = declaredIn(root);
  const labels = declared.checks.map((one) => one.label);
  assert.deepEqual(new Set(labels).size, labels.length);
  rmSync(root, { recursive: true, force: true });
});

test("a check with no reach is refused rather than guessed at", () => {
  const root = project(`[loop.nothing]\nrun = "true"\n`);
  const declared = declaredIn(root);
  assert.equal(declared.checks.length, 0);
  const said = declared.complaints[0];
  assert.match(said === undefined ? "" : said, /reach/);
  rmSync(root, { recursive: true, force: true });
});

test("exit zero is ok and its first line of output is the detail", () => {
  const root = project(null);
  const seen = ask({ label: "loop.t", reach: "internal", run: "echo all good", patience: 10 }, root);
  assert.equal(seen.verdict, "ok");
  assert.equal(seen.detail, "all good");
  rmSync(root, { recursive: true, force: true });
});

test("a non-zero exit is broken", () => {
  const root = project(null);
  const seen = ask({ label: "loop.t", reach: "internal", run: "echo went wrong; exit 1", patience: 10 }, root);
  assert.equal(seen.verdict, "broken");
  rmSync(root, { recursive: true, force: true });
});

test("an external check can say it could not be asked, and that is blind", () => {
  const root = project(null);
  const seen = ask({ label: "loop.t", reach: "external", run: `echo host is down; exit ${BLIND_EXIT}`, patience: 10 }, root);
  assert.equal(seen.verdict, "blind");
  rmSync(root, { recursive: true, force: true });
});

test("an internal check cannot be blind, because nothing it needs can be unreachable", () => {
  const root = project(null);
  const seen = ask({ label: "loop.t", reach: "internal", run: `exit ${BLIND_EXIT}`, patience: 10 }, root);
  assert.equal(seen.verdict, "broken");
  rmSync(root, { recursive: true, force: true });
});

test("blind is counted apart from broken and never as ok", () => {
  const seen: readonly Seen[] = [
    { label: "a", reach: "internal", verdict: "ok", detail: "", millis: 1 },
    { label: "b", reach: "external", verdict: "blind", detail: "", millis: 1 },
    { label: "c", reach: "internal", verdict: "broken", detail: "", millis: 1 },
  ];
  const tally = tallyOf(seen);
  assert.equal(tally.ok, 1);
  assert.equal(tally.broken, 1);
  assert.equal(tally.blind, 1);
  assert.deepEqual([...tally.failing], ["b", "c"]);
});

test("a loop file that cannot be read is a complaint, not an empty project", () => {
  const root = project(`[loop.build]\nreach = "internal"\nrun = "true"\n`);
  try {
    chmodSync(join(root, LOOP_FILE), 0o000);
    const declared = declaredIn(root);
    if (declaredIn(root).complaints.length === 0 && declared.checks.length > 0) return;
    assert.equal(declared.checks.length, 0);
    assert.match(
      declared.complaints[0] === undefined ? "" : declared.complaints[0],
      /could not be read/,
      "a loop file nobody can read answered exactly as a project that declared nothing, which is the report this whole design says must never happen",
    );
  } finally {
    chmodSync(join(root, LOOP_FILE), 0o644);
    rmSync(root, { recursive: true, force: true });
  }
});

test("a check that says nothing says why it said nothing", () => {
  const root = project(null);
  try {
    const seen = ask({ label: "loop.t", reach: "external", run: "sleep 5", patience: 1 }, root);
    assert.notEqual(seen.verdict, "ok");
    assert.notEqual(
      seen.detail,
      "no detail",
      "a check killed by its own timeout produced no output, and 'no detail' is the report that hides why",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a check that did not answer is never ok, whatever exit code came with it", () => {
  const root = project(null);
  try {
    const seen = ask({ label: "loop.slow", reach: "external", run: "sleep 5", patience: 1 }, root);
    assert.notEqual(
      seen.verdict,
      "ok",
      "spawnSync can report a timeout and an exit status of zero together, and reading only the status called a check that never answered healthy — which is the one thing this whole design exists to prevent",
    );
    assert.equal(seen.verdict, "blind");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the same failure on an internal check is broken, because nothing it needs is unreachable", () => {
  const root = project(null);
  try {
    assert.equal(ask({ label: "loop.i", reach: "internal", run: "sleep 5", patience: 1 }, root).verdict, "broken");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a check that reported an error is never ok, even with a zero exit status", () => {
  assert.equal(
    verdictOf(0, "external", false),
    "blind",
    "spawnSync can set an error and a zero status together when a process exits as its own timeout fires — seen on the first run of this command. Reading only the status called a check that never answered healthy",
  );
  assert.equal(verdictOf(0, "internal", false), "broken");
  assert.equal(verdictOf(0, "external", true), "ok");
  assert.equal(verdictOf(0, "internal", true), "ok");
});

function commit(root: string, message: string): Outcome {
  return new Loop(root).onHook({
    event: "CommitMessage",
    root,
    payload: { kind: "text", text: message },
  });
}

test("a project that declares no checks is never refused a commit over them", () => {
  const root = project(null);
  keep(root, root, { at: "2026-08-20T00:00:00Z", ok: 0, broken: 3, blind: 0, failing: ["a", "b", "c"], brokenNames: ["a", "b", "c"], blindNames: [] });
  assert.equal(
    commit(root, "anything").kind,
    "pass",
    "a project with an empty loop.toml declared nothing, so there is nothing of theirs to be broken and refusing would be refusing over somebody else's stale file",
  );
  rmSync(root, { recursive: true, force: true });
});

test("a broken check refuses the commit, and the refusal names which", () => {
  const root = project(`[loop.build]\nreach = "internal"\nrun = "true"\n`);
  keep(root, root, { at: "2026-08-20T00:00:00Z", ok: 1, broken: 1, blind: 0, failing: ["loop.build"], brokenNames: ["loop.build"], blindNames: [] });
  const said = commit(root, "a commit");
  assert.equal(said.kind, "block");
  assert.match(said.kind === "block" ? said.reason : "", /loop\.build/);
  rmSync(root, { recursive: true, force: true });
});

test("blind is said and never refused, because a gate that blocks on the weather gets turned off", () => {
  const root = project(`[loop.box]\nreach = "external"\nrun = "true"\n`);
  keep(root, root, { at: "2026-08-20T00:00:00Z", ok: 1, broken: 0, blind: 1, failing: ["loop.box"], brokenNames: [], blindNames: ["loop.box"] });
  assert.equal(
    commit(root, "a commit").kind,
    "mention",
    "blind is a fact about the world rather than about this commit. Refusing it means a commit cannot be made while a remote box is down, which is how a gate gets disabled",
  );
  rmSync(root, { recursive: true, force: true });
});

test("a departure is available and has to be written down", () => {
  const root = project(`[loop.build]\nreach = "internal"\nrun = "true"\n`);
  keep(root, root, { at: "2026-08-20T00:00:00Z", ok: 0, broken: 1, blind: 0, failing: ["loop.build"], brokenNames: ["loop.build"], blindNames: [] });
  assert.equal(commit(root, "a commit\n\nLoop-broken: the box is being rebuilt, tracked in decisions").kind, "pass");
  assert.equal(commit(root, "a commit").kind, "block", "the bypass must be the only way past, never the default");
  rmSync(root, { recursive: true, force: true });
});

test("a blind check is never named as broken, because that is the report this design exists to refuse", () => {
  const root = project(`[loop.a]\nreach = "internal"\nrun = "true"\n`);
  keep(root, root, {
    at: "2026-08-20T00:00:00Z",
    ok: 6,
    broken: 1,
    blind: 1,
    failing: ["loop.drift", "loop.box"],
    brokenNames: ["loop.drift"],
    blindNames: ["loop.box"],
  });
  const said = commit(root, "a commit");
  const reason = said.kind === "block" ? said.reason : "";
  assert.match(reason, /loop\.drift/);
  assert.doesNotMatch(
    reason,
    /loop\.box/,
    "the refusal named a blind check among the broken ones. It did exactly this on its first real firing: one broken, one blind, and a message that said 1 broken and listed both",
  );
  rmSync(root, { recursive: true, force: true });
});

test("a check killed for being slow says so, and does not read as a service that was unreachable", () => {
  const root = project(null);
  try {
    const seen = ask({ label: "loop.tour", reach: "external", run: "sleep 5", patience: 1 }, root);

    assert.equal(seen.timedOut, true);
    assert.match(seen.detail, /timed out after 1s/);
    assert.match(
      seen.detail,
      /patience/,
      "a check reported blind for being slow sends the reader to look at a healthy service; the report has to name the timeout and the knob that raises it",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a check that really could not be asked is not marked as having timed out", () => {
  const root = project(null);
  try {
    const seen = ask({ label: "loop.t", reach: "external", run: `exit ${BLIND_EXIT}`, patience: 10 }, root);

    assert.equal(seen.verdict, "blind");
    assert.equal(seen.timedOut, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("patience comes from the check, and a malformed one is complained about rather than guessed", () => {
  const root = project(`[loop.slow]\nreach = "external"\npatience = 180\nrun = "true"\n\n[loop.bad]\nreach = "internal"\npatience = "180"\nrun = "true"\n`);
  try {
    const declared = declaredIn(root);
    const slow = declared.checks.find((one) => one.label === "loop.slow");

    assert.equal(slow?.patience, 180);
    assert.equal(declared.checks.find((one) => one.label === "loop.bad")?.patience, PATIENCE_SECONDS);
    assert.equal(declared.complaints.length, 1);
    assert.match(declared.complaints.join(" "), /patience/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a project that declares nothing is told so on every prompt", () => {
  const root = project(null);
  const home = mkdtempSync(join(tmpdir(), "looper-home-"));
  const said = new Loop(home).inject({ root, budget: 9800 });
  assert.equal(said.length, 1);
  const first = said[0];
  assert.match(first === undefined ? "" : first.text, /declares no checks/);
  rmSync(root, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

test("declared checks that were never asked are not silence either", () => {
  const root = project(`[loop.one]\nreach = "internal"\nrun = "true"\n`);
  const home = mkdtempSync(join(tmpdir(), "looper-home-"));
  const said = new Loop(home).inject({ root, budget: 9800 });
  assert.equal(said.length, 1);
  const first = said[0];
  assert.match(first === undefined ? "" : first.text, /never been asked/);
  rmSync(root, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});
