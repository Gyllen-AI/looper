import { test } from "node:test";
import assert from "node:assert/strict";

import { CONCEDING_NOTHING } from "../src/law/concessions.ts";
import { judge } from "../src/law/engine.ts";
import { countIn } from "./helpers.ts";
import { commentCheck } from "../src/law/ts/comment.ts";
import { defeatedCheckingCheck } from "../src/law/ts/defeated-checking.ts";
import { suppressionCheck } from "../src/law/ts/suppression.ts";
import { vanishedErrorCheck } from "../src/law/ts/vanished-error.ts";
import type { Check } from "../src/law/engine.ts";

const count = countIn;

function inFunction(body: string): string {
  return `function work() {\n${body}\n}\n`;
}

test("an empty catch loses the error", () => {
  assert.equal(count(vanishedErrorCheck, inFunction("try { read() } catch {}")), 1);
  assert.equal(
    count(vanishedErrorCheck, inFunction("try { read() } catch { recover() }")),
    1,
  );
});

test("throwing it on is the first door", () => {
  assert.equal(
    count(vanishedErrorCheck, inFunction("try { read() } catch (cause) { throw cause }")),
    0,
  );
});

test("handing it to the caller is the second door", () => {
  const text = inFunction(
    "try { read() } catch (cause) { return { kind: 'failed', detail: String(cause) } }",
  );
  assert.equal(count(vanishedErrorCheck, text), 0);
});

test("a caught error bound and then ignored is still lost", () => {
  assert.equal(
    count(vanishedErrorCheck, inFunction("try { read() } catch (cause) { recover() }")),
    1,
  );
});

test("logging it is the third door, but only through a real logger", () => {
  const imported = `import { logger } from "pino-instance";\n${inFunction(
    "try { read() } catch { logger.error('failed'); recover() }",
  )}`;
  assert.equal(count(vanishedErrorCheck, imported), 0);

  const counterfeit = `const logger = { error() {} };\n${inFunction(
    "try { read() } catch { logger.error('failed'); recover() }",
  )}`;
  assert.equal(
    count(vanishedErrorCheck, counterfeit),
    1,
    "a locally declared logger that does nothing must not satisfy the rule",
  );
});

test("telling the compiler to stop checking is caught in each spelling", () => {
  assert.equal(count(defeatedCheckingCheck, "const a = input as any;"), 1);
  assert.equal(count(defeatedCheckingCheck, "const b = input as unknown as User;"), 1);
  assert.equal(count(defeatedCheckingCheck, "const c = <User>input;"), 1);
  assert.equal(count(defeatedCheckingCheck, "const d = maybe!.name;"), 1);
});

test("as const is the opposite of defeating the checker and is untouched", () => {
  assert.equal(count(defeatedCheckingCheck, "const modes = ['a', 'b'] as const;"), 0);
});

test("a plain cast to a real type is the same claim as any other", () => {
  assert.equal(
    count(defeatedCheckingCheck, "const e = value as User;"),
    1,
    "the doctrine names bare `as` as one of the four ways to tell the compiler to trust you, and it is the commonest of them",
  );
});

test("one act of casting is one finding, however many words it takes", () => {
  assert.equal(
    count(defeatedCheckingCheck, "const b = input as unknown as User;"),
    1,
    "as unknown as User is two cast nodes on one line; reporting it twice is noise about a single decision",
  );
});

test("every suppression marker is caught, wherever the comment sits", () => {
  for (const marker of [
    "// @ts-ignore",
    "// @ts-expect-error",
    "/* @ts-nocheck */",
    "// eslint-disable-next-line no-console",
  ]) {
    assert.equal(count(suppressionCheck, `${marker}\nconst a = 1;\n`), 1, marker);
  }
});

test("an ordinary comment is not this rule's business", () => {
  assert.equal(count(suppressionCheck, "// just a note\nconst a = 1;\n"), 0);
});

test("the suppression is reported at the line it sits on", () => {
  const verdict = judge(
    [suppressionCheck],
    "fast",
    { file: "src/a.ts", text: "const a = 1;\nconst b = 2;\n// @ts-ignore\nconst c = 3;\n" },
    CONCEDING_NOTHING,
  );
  assert.equal(verdict.violations[0]?.line, 3);
});

const CAUGHT: readonly (readonly [string, number])[] = [
  ['function f(){ try { g(); } catch (e) { return 1; } }', 1],
  ['function f(){ try { g(); } catch (e) { String(e); return 1; } }', 1],
  ['function f(){ try { g(); } catch (e) { const _unused = e; return 1; } }', 1],
  ['function f(){ try { g(); } catch (e) { const d = String(e); return 1; } }', 1],
  ['function f(){ try { g(); } catch (e) { throw new Error("failed"); } }', 1],
  ['function f(){ try { g(); } catch (e) { throw new Wrapped(e); } }', 0],
  ['function f(){ try { g(); } catch (e) { throw e; } }', 0],
  ['function f(){ try { g(); } catch (e) { const d = String(e); return { d }; } }', 0],
  ['function f(reject){ try { g(); } catch (e) { reject(e); } }', 0],
  ['function f(setState){ try { g(); } catch (e) { setState({ error: e }); } }', 0],
  ['function f(){ try { g(); } catch (e) { if (e.name === "A") return "t"; return "e"; } }', 0],
  ['function f(){ let held; try { g(); } catch (e) { held = [e]; } return held; }', 0],
];

test("TS-ERROR:4 asks that the error actually leaves, not that it is mentioned", () => {
  for (const [code, expected] of CAUGHT) {
    assert.equal(countIn(vanishedErrorCheck, code), expected, `wanted ${expected} for: ${code}`);
  }
});

const WRITTEN_DOWN: readonly (readonly [string, number])[] = [
  ["// why\nconst a = 1;", 1],
  ['/// <reference path="./x.ts" />\nconst a = 1;', 0],
  ["/*\n * Copyright (c) 2026 Someone\n * SPDX-License-Identifier: MIT\n */\nconst a = 1;", 0],
  ["const a = 1;\n/*\n * Copyright (c) 2026 Someone\n */\nconst b = 2;", 1],
];

test("TS-DEAD:2 bans prose, not compiler instructions or a licence header", () => {
  for (const [code, expected] of WRITTEN_DOWN) {
    assert.equal(countIn(commentCheck, code), expected, `wanted ${expected} for: ${code}`);
  }
});
