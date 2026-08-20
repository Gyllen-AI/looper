import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NO_TURN } from "../src/capability.ts";
import { NEVER_SAID } from "../src/said.ts";
import { Stall } from "../src/stall/capability.ts";
import { metricOf } from "../src/stall/fingerprints.ts";
import { note, reachedFor, shapeOf, type Reached } from "../src/stall/stream.ts";

test("a bash shape is the whole command, so two different greps are two different shapes", () => {
  assert.equal(shapeOf("Bash", "grep -rn foo src"), "grep -rn foo src");
  assert.notEqual(shapeOf("Bash", "grep -rn foo src"), shapeOf("Bash", "grep -rn bar tests"));
  assert.equal(shapeOf("Bash", "  ls   -la \n"), "ls -la");
  assert.equal(shapeOf("Read", "/a/b.ts"), "/a/b.ts");
});

test("what one session reached for is not read into another session's metric", () => {
  const home = mkdtempSync(join(tmpdir(), "looper-stream-"));
  try {
    const root = "/some/project";
    note(root, home, { at: 1, tool: "Bash", shape: "ls", session: "mine" });
    note(root, home, { at: 2, tool: "Bash", shape: "set -a", session: "theirs" });
    const mine = reachedFor(root, home, "mine");
    assert.equal(mine.kind, "reached");
    if (mine.kind !== "reached") return;
    assert.deepEqual(mine.reached.map((one) => one.shape), ["ls"]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

function reads(now: number, shapes: readonly string[]): readonly Reached[] {
  return shapes.map((shape, at) => ({ at: now - (shapes.length - at) * 60000, tool: "Read", shape, session: "s" }));
}

test("reading many different files is research; reading the same file eight times is a stall", () => {
  const now = Date.now();
  const research = metricOf(reads(now, ["a", "b", "c", "d", "e", "f", "g", "h", "i"]), now);
  assert.deepEqual([...research.stalls], []);
  const circling = metricOf(reads(now, ["a", "a", "a", "a", "a", "a", "a", "a", "a"]), now);
  assert.ok(circling.stalls.length > 0);
  assert.ok(circling.stalls.some((one) => one.means.includes("re-reading")));
});

test("without a session id the stall metric says nothing, rather than everyone's shapes", () => {
  const said = new Stall().inject({ root: process.cwd(), budget: 9800, turn: NO_TURN, said: NEVER_SAID });
  assert.deepEqual([...said], []);
});
