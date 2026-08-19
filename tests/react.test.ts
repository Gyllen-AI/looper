import { test } from "node:test";
import assert from "node:assert/strict";

import { countWhere } from "./helpers.ts";
import { CONCEDING_NOTHING } from "../src/law/concessions.ts";
import type { Check } from "../src/law/engine.ts";
import { conditionalHookCheck } from "../src/law/react/hooks.ts";
import { lyingDependenciesCheck } from "../src/law/react/effect-deps.ts";

const count = (check: Check, text: string): number =>
  countWhere(check, text, "src/Panel.tsx", CONCEDING_NOTHING);

test("a hook behind an if is caught", () => {
  assert.equal(
    count(conditionalHookCheck, "function P({ id }) {\n  if (id) {\n    useEffect(() => {}, []);\n  }\n}"),
    1,
  );
});

test("a hook after an early return is caught", () => {
  assert.equal(
    count(conditionalHookCheck, "function P({ id }) {\n  if (!id) return null;\n  const [a] = useState(0);\n  return a;\n}"),
    1,
    "the ban names an early return, so the rule has to read it",
  );
});

test("a hook inside a loop is caught", () => {
  assert.equal(
    count(conditionalHookCheck, "function P({ ids }) {\n  for (const id of ids) {\n    useMemo(() => id, [id]);\n  }\n}"),
    1,
  );
});

test("a hook behind && is caught, because that is a condition too", () => {
  assert.equal(
    count(conditionalHookCheck, "function P({ on }) {\n  on && useEffect(() => {}, []);\n}"),
    1,
  );
});

test("React.useState behind a condition is the same mistake", () => {
  assert.equal(
    count(conditionalHookCheck, "function P({ on }) {\n  if (on) {\n    React.useState(0);\n  }\n}"),
    1,
  );
});

test("hooks at the top with the condition inside are the legal spelling", () => {
  const lawful = `function P({ id }) {
  useEffect(() => {
    if (!id) return;
    load(id);
  }, [id]);
  return null;
}`;
  assert.equal(count(conditionalHookCheck, lawful), 0);
});

test("an ordinary function called in a condition is not a hook", () => {
  assert.equal(
    count(conditionalHookCheck, "function P({ on }) {\n  if (on) { render(); }\n}"),
    0,
  );
});

test("an effect that leaves something out is caught", () => {
  const lying = `function P({ userId }) {
  useEffect(() => {
    load(userId);
  }, []);
}`;
  assert.equal(count(lyingDependenciesCheck, lying), 1);
});

test("a module constant is not something an effect can be stale about", () => {
  const constant = `const userId = 1;
function P() {
  useEffect(() => {
    load(userId);
  }, []);
}`;
  assert.equal(
    count(lyingDependenciesCheck, constant),
    0,
    "this file asserted the opposite until adopter issue #87. A const at module scope is made once for the life of the module, so it cannot change between renders and cannot make an effect stale, which is the whole harm the rule names. Listing it changes nothing at runtime, and this is the rule whose wrong fix hangs the page",
  );
});

test("a module let can be reassigned, so it is still something to be stale about", () => {
  const changeable = `let userId = 1;
function P() {
  useEffect(() => {
    load(userId);
  }, []);
}`;
  assert.equal(count(lyingDependenciesCheck, changeable), 1);
});

test("an effect that lists what it reads passes", () => {
  const honest = `const userId = 1;
function P() {
  useEffect(() => {
    load(userId);
  }, [userId]);
}`;
  assert.equal(count(lyingDependenciesCheck, honest), 0);
});

test("something the effect makes itself is not something it depends on", () => {
  const inner = `function P() {
  useEffect(() => {
    const now = Date.now();
    report(now);
  }, []);
}`;
  assert.equal(count(lyingDependenciesCheck, inner), 0);
});

test("useMemo and useCallback are held to the same promise", () => {
  const lying = `function P({ rate }) {
  const total = useMemo(() => price * rate, []);
  return total;
}`;
  assert.equal(count(lyingDependenciesCheck, lying), 1);
});

const HOOK_SHAPES: readonly (readonly [string, number])[] = [
  ["function C({ on }) { if (!on) return null; useState(0); return null; }", 1],
  ["function C({ on }) { if (!on) { return null; } useState(0); return null; }", 1],
  ["function C() { useState(0); return null; }", 0],
  ["function C({ id }) { useEffect(() => { if (!id) return; load(id); }, [id]); return null; }", 0],
];

test("REACT:1 reads the early return its ban names, and nothing else as one", () => {
  for (const [code, expected] of HOOK_SHAPES) {
    assert.equal(count(conditionalHookCheck, code), expected, `wanted ${expected} for: ${code}`);
  }
});

const DEPENDENCY_SHAPES: readonly (readonly [string, number])[] = [
  ["function C({ id }) { useEffect(() => { load(id); }, []); return null; }", 1],
  ["function C(props) { useEffect(() => { load(props.id); }, []); return null; }", 1],
  ["function C() { const [id] = useState(0); useEffect(() => { load(id); }, []); return null; }", 1],
  ["function C({ user }) { const id = 1; useEffect(() => { send(user.id); }, [user]); return null; }", 0],
  ["function C() { const [n, setN] = useState(0); useEffect(() => { setN(1); }, []); return null; }", 0],
  ["function C() { const r = useRef(null); useEffect(() => { r.current?.focus(); }, []); return null; }", 0],
  ["function C({ id }) { useEffect(() => { get(id).then((x) => use(x)); }, [id]); return null; }", 0],
];

test("REACT:2 sees props and patterns, and leaves stable things alone", () => {
  for (const [code, expected] of DEPENDENCY_SHAPES) {
    assert.equal(count(lyingDependenciesCheck, code), expected, `wanted ${expected} for: ${code}`);
  }
});
