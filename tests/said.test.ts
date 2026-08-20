import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { allocate } from "../src/allocator.ts";
import { NO_TURN, type Capability, type HookEvent, type Injection, type Outcome } from "../src/capability.ts";
import { SaidInSession, gistOf, saidPath, type Said, type SaidStore } from "../src/said.ts";

const NO_EVENTS: readonly HookEvent[] = [];

function home(): string {
  return mkdtempSync(join(tmpdir(), "looper-said-"));
}

test("a notice is heard once per session, and a number changing does not make it new", () => {
  const where = home();
  try {
    const said = new SaidInSession("/some/project", where, "session-a");
    assert.equal(said.heard("law", "1705 problems were here"), false);
    said.note("law", "1705 problems were here");
    assert.equal(said.heard("law", "1705 problems were here"), true);
    assert.equal(said.heard("law", "1698 problems were here"), true, "a counter ticking is not news");
    assert.equal(said.heard("law", "nothing was here"), false, "different words are news");
    assert.equal(
      new SaidInSession("/some/project", where, "session-b").heard("law", "1705 problems were here"),
      false,
      "another session has heard nothing",
    );
    assert.equal(
      new SaidInSession("/some/project", where, "session-a").heard("law", "1705 problems were here"),
      true,
      "the store survives the process",
    );
  } finally {
    rmSync(where, { recursive: true, force: true });
  }
});

test("a store that cannot be read says so and forgets nothing quietly", () => {
  const where = home();
  try {
    const path = saidPath("/some/project", where, "session-a");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "{not json");
    const said = new SaidInSession("/some/project", where, "session-a");
    assert.ok(said.trouble.length > 0);
    assert.equal(said.heard("law", "anything"), false);
  } finally {
    rmSync(where, { recursive: true, force: true });
  }
});

test("the gist ignores digits and nothing else", () => {
  assert.equal(gistOf("16 of 20 decisions"), gistOf("17 of 21 decisions"));
  assert.notEqual(gistOf("16 of 20 decisions"), gistOf("16 of 20 rules"));
});

class Recording implements SaidStore {
  readonly trouble = "";
  readonly noted: string[] = [];
  readonly heardAlready: Set<string>;

  constructor(heardAlready: readonly string[]) {
    this.heardAlready = new Set(heardAlready);
  }

  heard(source: string): boolean {
    return this.heardAlready.has(source);
  }

  note(source: string): void {
    this.noted.push(source);
  }
}

function behind(store: SaidStore): Said {
  return { kind: "session", store };
}

function speaking(name: string, text: string, notice: boolean, priority: number): Capability {
  return {
    name,
    inject: (): readonly Injection[] => [{ source: name, priority, text, required: false, notice }],
    hooks: () => NO_EVENTS,
    onHook: (): Outcome => ({ kind: "pass" }),
    tools: () => [],
    call: () => ({ kind: "unknown-tool", asked: "" }),
  };
}

test("the allocator leaves out a notice this session has heard, and notes only what it actually sent", () => {
  const fresh = new Recording([]);
  const first = allocate(
    [speaking("rule", "a rule", false, 0), speaking("law", "a notice", true, 20)],
    { root: process.cwd(), budget: 9800, turn: NO_TURN, said: behind(fresh) },
  );
  assert.ok(first.allocation.text.includes("a notice"));
  assert.deepEqual(fresh.noted, ["law"]);

  const heard = new Recording(["law"]);
  const second = allocate(
    [speaking("rule", "a rule", false, 0), speaking("law", "a notice", true, 20)],
    { root: process.cwd(), budget: 9800, turn: NO_TURN, said: behind(heard) },
  );
  assert.ok(!second.allocation.text.includes("a notice"));
  assert.deepEqual(second.allocation.dropped, [], "silence is not a drop, so the marker does not name it");
  assert.deepEqual(heard.noted, []);

  const tight = new Recording([]);
  const starved = allocate(
    [speaking("rule", "r".repeat(9795), false, 0), speaking("law", "a notice", true, 20)],
    { root: process.cwd(), budget: 9800, turn: NO_TURN, said: behind(tight) },
  );
  assert.equal(starved.allocation.dropped.length, 1);
  assert.deepEqual(tight.noted, [], "a notice dropped for budget was never heard, so it speaks next turn");
});
