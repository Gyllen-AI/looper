import { test } from "node:test";
import assert from "node:assert/strict";

import { allocate } from "../src/allocator.ts";
import type {
  Capability,
  HookEvent,
  Injection,
  Outcome,
} from "../src/capability.ts";

const NO_EVENTS: readonly HookEvent[] = [];

class Speaker implements Capability {
  readonly name: string;
  readonly priority: number;
  readonly body: string;

  constructor(name: string, priority: number, body: string) {
    this.name = name;
    this.priority = priority;
    this.body = body;
  }

  inject(): readonly Injection[] {
    return [{ source: this.name, priority: this.priority, text: this.body }];
  }

  hooks(): readonly HookEvent[] {
    return NO_EVENTS;
  }

  onHook(): Outcome {
    return { kind: "pass" };
  }
}

class Silent implements Capability {
  readonly name = "silent";

  inject(): readonly Injection[] {
    return [];
  }

  hooks(): readonly HookEvent[] {
    return NO_EVENTS;
  }

  onHook(): Outcome {
    return { kind: "pass" };
  }
}

class Broken implements Capability {
  readonly name = "broken";

  inject(): readonly Injection[] {
    throw new Error("no doctrine directory");
  }

  hooks(): readonly HookEvent[] {
    return NO_EVENTS;
  }

  onHook(): Outcome {
    return { kind: "pass" };
  }
}

const CONTEXT = { root: "/nowhere", budget: 100 };

test("priority decides the order, not registration", () => {
  const run = allocate(
    [new Speaker("second", 5, "BBB"), new Speaker("first", 0, "AAA")],
    CONTEXT,
  );

  assert.deepEqual([...run.allocation.contributors], ["first", "second"]);
  assert.equal(run.allocation.text, "AAA\n\nBBB");
});

test("a capability with nothing to say costs nothing", () => {
  const run = allocate([new Silent(), new Speaker("router", 0, "AAA")], CONTEXT);

  assert.deepEqual([...run.allocation.contributors], ["router"]);
  assert.equal(run.allocation.text, "AAA");
});

test("overflow is dropped and the drop is visible", () => {
  const run = allocate(
    [new Speaker("first", 0, "A".repeat(90)), new Speaker("second", 1, "B".repeat(90))],
    CONTEXT,
  );

  assert.deepEqual([...run.allocation.contributors], ["first"]);
  assert.deepEqual([...run.allocation.dropped], ["second"]);
  assert.ok(run.allocation.text.includes("dropped for budget"));
  assert.ok(run.allocation.text.includes("second"));
});

test("the first contributor is never dropped, and says so when it overflows", () => {
  const run = allocate([new Speaker("router", 0, "A".repeat(500))], CONTEXT);

  assert.deepEqual([...run.allocation.contributors], ["router"]);
  assert.equal(run.allocation.overflowed, true);
});

test("a capability that throws is skipped and complained about, never fatal", () => {
  const run = allocate([new Broken(), new Speaker("router", 1, "AAA")], CONTEXT);

  assert.deepEqual([...run.allocation.contributors], ["router"]);
  assert.equal(run.complaints.length, 1);
  assert.equal(run.complaints[0]?.capability, "broken");
});

test("the cost is reported in characters", () => {
  const run = allocate([new Speaker("router", 0, "AAAAA")], CONTEXT);
  assert.equal(run.allocation.chars, 5);
});

test("what each rule set cost is reported, because the author cannot cut what they cannot see", () => {
  const run = allocate(
    [new Speaker("first", 0, "a".repeat(100)), new Speaker("second", 10, "b".repeat(250))],
    { root: ".", budget: 9800 },
  );

  assert.deepEqual(
    run.allocation.weighed.map((held) => `${held.source}:${held.chars}`),
    ["first:100", "second:250"],
    "the widths are what the doctrine author needs to decide what to cut, and estimating them by hand with wc is the job looper is supposed to be doing",
  );
});
