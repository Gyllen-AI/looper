import { test } from "node:test";
import assert from "node:assert/strict";

import { CONCEDING_NOTHING } from "../src/law/concessions.ts";
import { judge } from "../src/law/engine.ts";
import { countIn } from "./helpers.ts";
import { stubValueCheck } from "../src/law/ts/stub-value.ts";

const CHECKS = [stubValueCheck];

function inFunction(body: string): string {
  return `function work() {\n${body}\n}\n`;
}

function linesFlagged(text: string): readonly number[] {
  const verdict = judge(CHECKS, "fast", { file: "src/a.ts", text }, CONCEDING_NOTHING);
  return verdict.violations.map((violation) => violation.line);
}

test("a catch that returns null is caught", () => {
  assert.deepEqual(
    [...linesFlagged(inFunction("try {\n  read();\n} catch {\n  return null;\n}"))],
    [5],
  );
});

test("every fabricated shape is caught, not just null", () => {
  for (const made of ["null", "[]", "{}", "0", '""', "false", "undefined"]) {
    assert.equal(
      linesFlagged(inFunction(`try { read() } catch { return ${made}; }`)).length,
      1,
      `returning ${made} from a catch was not caught`,
    );
  }
});

test("a catch that rethrows is lawful", () => {
  assert.deepEqual([...linesFlagged(inFunction("try { read() } catch (cause) { throw cause }"))], []);
});

test("a catch that logs and recovers with real work is lawful", () => {
  const text = inFunction(`try {
  return readCache();
} catch (cause) {
  logger.warn({ cause }, "cache unreadable");
  return countFromSource();
}`);
  assert.deepEqual([...linesFlagged(text)], []);
});

test("a promise catch handing back a made-up value is caught", () => {
  assert.equal(linesFlagged("load().catch(() => []);").length, 1);
  assert.equal(linesFlagged("load().catch(() => null);").length, 1);
  assert.equal(linesFlagged("load().catch((cause) => { return 0; });").length, 1);
});

test("a promise catch that rethrows is lawful", () => {
  assert.deepEqual(
    [...linesFlagged("load().catch((cause) => { throw new Wrapped(cause) });")],
    [],
  );
});

test("returning a real value outside a catch is never touched", () => {
  const text = `function empty() {
  return [];
}
function nothing() {
  return null;
}`;
  assert.deepEqual([...linesFlagged(text)], []);
});

test("a returned call is real work, not a fabrication", () => {
  assert.deepEqual(
    [...linesFlagged(inFunction("try { read() } catch { return recount(source) }"))],
    [],
  );
});

test("TSX parses, so a React file is judged like any other", () => {
  const verdict = judge(
    CHECKS,
    "fast",
    {
      file: "src/Panel.tsx",
      text: "export function Panel() {\n  try { return <div />; } catch { return null; }\n}\n",
    },
    CONCEDING_NOTHING,
  );
  assert.equal(verdict.violations.length, 1);
});

test("a file that cannot be parsed yields no verdict rather than a wrong one", () => {
  assert.deepEqual([...linesFlagged("function broken( {{{")], []);
});

const REPORTED: readonly (readonly [string, number])[] = [
  ['function f(){ try { return g(); } catch { return null; } }', 1],
  ['function f(){ try { return g(); } catch { return []; } }', 1],
  [
    'async function s(): Promise<"ok" | "timed out" | "error"> { try { return "ok"; } catch (e) { if (e instanceof Error && e.name === "AbortError") { return "timed out"; } return "error"; } }',
    0,
  ],
  ['function s(): boolean { try { if (!x) { return false; } return true; } catch (e) { return false; } }', 0],
  ['function f(){ try { return g(); } catch (e) { if (e.code === "ENOENT") return null; throw e; } }', 0],
];

test("a failure reported as a value is not a value made up to hide one", () => {
  for (const [code, expected] of REPORTED) {
    assert.equal(countIn(stubValueCheck, code), expected, `wanted ${expected} for: ${code}`);
  }
});
