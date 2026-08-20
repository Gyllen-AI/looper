import { test } from "node:test";
import assert from "node:assert/strict";

import { turnFrom } from "../src/commands/inject.ts";

test("the prompt hook reads the session and the prompt it is handed", () => {
  const read = turnFrom('{"session_id":"abc123","prompt":"is the map right?","cwd":"/x"}');
  assert.equal(read.kind, "turn");
  if (read.kind !== "turn") return;
  assert.deepEqual(read.turn.session, { kind: "known", id: "abc123" });
  assert.equal(read.turn.prompt, "is the map right?");
  assert.deepEqual(read.turn.inHand, { kind: "from-git" });
});

test("an empty payload is a turn nobody described, and a broken one is named", () => {
  const empty = turnFrom("  ");
  assert.equal(empty.kind, "turn");
  if (empty.kind === "turn") assert.deepEqual(empty.turn.session, { kind: "unknown" });
  assert.equal(turnFrom("{nope").kind, "unreadable");
});
