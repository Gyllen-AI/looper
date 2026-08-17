import { test } from "node:test";
import assert from "node:assert/strict";

import { CHECKS } from "../src/law/checks.ts";
import { CONCEDING_NOTHING } from "../src/law/concessions.ts";
import { CASES } from "../audit/cases.ts";
import { disagreements } from "../audit/judge.ts";

test("every rule does what its own ban text says, in every spelling", () => {
  const said = disagreements(CASES, CHECKS, CONCEDING_NOTHING);
  assert.deepEqual(said, [], `${said.length} of ${CASES.length} cases disagree with their rule`);
});

test("every rule has at least one case written from its ban text", () => {
  const covered = new Set(CASES.map((held) => held.rule));
  const untested = CHECKS.map((held) => held.rule.id).filter((id) => !covered.has(id));
  assert.deepEqual(untested, [], "these rules have no case written from their words");
});
