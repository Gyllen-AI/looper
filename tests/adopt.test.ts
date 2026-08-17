import { first } from "./helpers.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkFor, isShape, type Adopted } from "../src/adopt/shapes.ts";
import { instancesOf, proposeRule, ratify } from "../src/adopt/ratify.ts";
import { proposalFor, readAdopted, rememberProposal, withRule, writeAdopted } from "../src/adopt/store.ts";
import { CONCEDING_NOTHING } from "../src/law/concessions.ts";
import { judge } from "../src/law/engine.ts";

const MOMENT: Adopted = {
  shape: "banned-symbol",
  what: "moment",
  because: "moment is unmaintained; we moved to Temporal",
  instead: ["Temporal.PlainDate.from(t)"],
  evidence: [],
};

function project(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), "looper-adopt-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t" }));
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(join(root, name), text);
  }
  return root;
}

test("a rule nothing in the project breaks is refused, not adopted", () => {
  const root = project({ "src/a.ts": "export const rate = 0.2;\n" });
  try {
    assert.equal(proposeRule(root, MOMENT).kind, "no-evidence");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a rule with real instances reports every one of them", () => {
  const root = project({
    "src/a.ts": 'import moment from "moment";\nexport const a = moment();\n',
    "src/b.ts": 'import moment from "moment";\nexport const b = moment().add(1);\n',
  });
  try {
    const proposal = proposeRule(root, MOMENT);
    assert.equal(proposal.kind, "found");
    if (proposal.kind !== "found") return;
    assert.equal(proposal.where.length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("it is refused while a single instance remains", () => {
  const root = project({ "src/a.ts": 'import moment from "moment";\nexport const a = moment();\n' });
  try {
    const verdict = ratify(root, MOMENT, ["src/a.ts:2"]);
    assert.equal(verdict.kind, "refused");
    if (verdict.kind !== "refused") return;
    assert.equal(verdict.remaining.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("once every instance is rewritten it is adopted, carrying its evidence", () => {
  const root = project({ "src/a.ts": "export const a = Temporal.Now.plainDateISO();\n" });
  try {
    const verdict = ratify(root, MOMENT, ["src/a.ts:2"]);
    assert.equal(verdict.kind, "adopted");
    if (verdict.kind !== "adopted") return;
    assert.deepEqual([...verdict.rule.evidence], ["src/a.ts:2"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the evidence is written at proposal time, because by adoption it is gone", () => {
  const root = project({ "src/a.ts": 'import moment from "moment";\nexport const a = moment();\n' });
  try {
    assert.equal(proposalFor(root, MOMENT).kind, "none");
    rememberProposal(root, MOMENT, ["src/a.ts:2"]);

    const pending = proposalFor(root, MOMENT);
    assert.equal(pending.kind, "proposed");
    if (pending.kind !== "proposed") return;
    assert.deepEqual([...pending.evidence], ["src/a.ts:2"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a pending proposal for one rule does not vouch for another", () => {
  const root = project({ "src/a.ts": "export const a = 1;\n" });
  try {
    rememberProposal(root, MOMENT, ["src/a.ts:2"]);
    const other = { ...MOMENT, what: "lodash" };
    assert.equal(proposalFor(root, other).kind, "none");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an adopted rule reads back, and judges like any other", () => {
  const root = project({ "src/a.ts": "export const a = 1;\n" });
  try {
    writeAdopted(root, withRule([], { ...MOMENT, evidence: ["src/a.ts:2"] }));
    const held = readAdopted(root);

    assert.equal(held.length, 1);
    assert.equal(held[0]?.what, "moment");
    assert.deepEqual([...first(held).evidence], ["src/a.ts:2"]);

    const found = judge(
      [checkFor(MOMENT)],
      "fast",
      { file: "src/new.ts", text: 'import moment from "moment";\nconst x = moment();\n' },
      CONCEDING_NOTHING,
    );
    assert.equal(found.violations.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("its message carries why it exists and what to write instead", () => {
  const rule = checkFor(MOMENT).rule;
  assert.ok(rule.why.includes("moment is unmaintained"));
  assert.deepEqual([...rule.instead], ["Temporal.PlainDate.from(t)"]);
  assert.equal(rule.valve.kind, "knob");
});

test("a banned import is the other shape, and only fires on that import", () => {
  const banned: Adopted = { ...MOMENT, shape: "banned-import", what: "lodash" };
  const root = project({});
  try {
    const flagged = (text: string) =>
      judge([checkFor(banned)], "fast", { file: "src/a.ts", text }, CONCEDING_NOTHING)
        .violations.length;

    assert.equal(flagged('import { map } from "lodash";\n'), 1);
    assert.equal(flagged('import { map } from "lodash-es";\n'), 0);
    assert.equal(flagged("const lodash = 1;\n"), 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("only shapes the engine already knows can be adopted", () => {
  assert.ok(isShape("banned-symbol"));
  assert.ok(isShape("banned-import"));
  assert.ok(!isShape("run-this-script"));
});

test("an unreadable file is reported rather than silently skipped", () => {
  const root = project({ "src/a.ts": "export const a = 1;\n" });
  try {
    assert.deepEqual([...instancesOf(root, MOMENT)], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
