import { test } from "node:test";
import assert from "node:assert/strict";

import { countIn } from "./helpers.ts";
import type { Check } from "../src/law/engine.ts";
import { anonymousProvenanceCheck } from "../src/law/ts/anonymous-provenance.ts";
import { droppedPromisesCheck } from "../src/law/ts/dropped-promises.ts";
import { hiddenDependencyCheck } from "../src/law/ts/hidden-dependency.ts";
import { nothingReturnedCheck } from "../src/law/ts/nothing-returned.ts";
import { silentMangleCheck } from "../src/law/ts/silent-mangle.ts";
import { stubValueCheck } from "../src/law/ts/stub-value.ts";
import { unfinishedCheck } from "../src/law/ts/unfinished.ts";
import { writtenAnyCheck } from "../src/law/ts/written-any.ts";

const count = countIn;

test("export * hides where a name came from", () => {
  assert.equal(count(anonymousProvenanceCheck, "export * from './order.ts';"), 1);
  assert.equal(count(anonymousProvenanceCheck, "export * from 'zod';"), 1);
});

test("naming what you export is lawful", () => {
  assert.equal(
    count(anonymousProvenanceCheck, "export { Order, Line } from './order.ts';"),
    0,
  );
});

test("a namespace import from your own file is the same hiding, one step over", () => {
  assert.equal(count(anonymousProvenanceCheck, "import * as orders from './orders.ts';"), 1);
});

test("a namespace import from a package is named provenance, not anonymous", () => {
  assert.equal(count(anonymousProvenanceCheck, "import * as z from 'zod';"), 0);
  assert.equal(count(anonymousProvenanceCheck, "import { join } from 'node:path';"), 0);
});

test("any written as a type is caught wherever it is written", () => {
  assert.equal(count(writtenAnyCheck, "const a: any = 1;"), 1);
  assert.equal(count(writtenAnyCheck, "function f(x: any) {}"), 1);
  assert.equal(count(writtenAnyCheck, "function f(): any { return 1; }"), 1);
  assert.equal(count(writtenAnyCheck, "let rows: any[] = [];"), 1);
  assert.equal(count(writtenAnyCheck, "let held: Promise<any>;"), 1);
});

test("an assertion is the other rule's business, not this one's", () => {
  assert.equal(
    count(writtenAnyCheck, "const a = input as any;"),
    0,
    "as any is TS-TYPE:3; counting it here would report one mistake twice",
  );
});

test("unknown is the legal spelling and is untouched", () => {
  assert.equal(count(writtenAnyCheck, "const parsed: unknown = JSON.parse(text);"), 0);
});

test("work handed to forEach is started and never waited for", () => {
  assert.equal(count(droppedPromisesCheck, "orders.forEach(async (o) => { await send(o) });"), 1);
  assert.equal(count(droppedPromisesCheck, "orders.forEach(async function (o) { await send(o) });"), 1);
});

test("forEach doing ordinary work is fine", () => {
  assert.equal(count(droppedPromisesCheck, "orders.forEach((o) => { total += o.value });"), 0);
});

test("the legal spellings are untouched", () => {
  assert.equal(count(droppedPromisesCheck, "await Promise.all(orders.map((o) => send(o)));"), 0);
  assert.equal(count(droppedPromisesCheck, "for (const o of orders) { await send(o); }"), 0);
});

test("a dependency fetched from inside the file is caught", () => {
  assert.equal(count(hiddenDependencyCheck, "function f() { const pdf = require('./pdf.ts'); }"), 1);
  assert.equal(count(hiddenDependencyCheck, "async function f() { await import('./pdf.ts'); }"), 1);
});

test("an ordinary import at the top of the file is the whole point", () => {
  assert.equal(count(hiddenDependencyCheck, "import { pdf } from './pdf.ts';\nconst a = 1;"), 0);
});

test("numbers quietly changed rather than refused", () => {
  assert.equal(count(silentMangleCheck, "const whole = ~~price;"), 1);
  assert.equal(count(silentMangleCheck, "const whole = price | 0;"), 1);
  assert.equal(count(silentMangleCheck, "const n = parseInt(text);"), 1);
  assert.equal(count(silentMangleCheck, "const n = Number.parseInt(text);"), 1);
});

test("saying which base, and saying which rounding, are the legal spellings", () => {
  assert.equal(count(silentMangleCheck, "const n = Number.parseInt(text, 10);"), 0);
  assert.equal(count(silentMangleCheck, "const whole = Math.trunc(price);"), 0);
  assert.equal(count(silentMangleCheck, "const flags = a | b;"), 0);
});

test("an exported function promising nothing is caught", () => {
  assert.equal(
    count(nothingReturnedCheck, "export function find(id: string): User | undefined { return u; }"),
    1,
  );
  assert.equal(
    count(nothingReturnedCheck, "export function find(id: string): User | null { return u; }"),
    1,
  );
  assert.equal(
    count(nothingReturnedCheck, "export const find = (id: string): User | null => u;"),
    1,
  );
  assert.equal(
    count(nothingReturnedCheck, "export async function find(id: string): Promise<User | null> { return u; }"),
    1,
  );
});

test("how you work inside your own file is your business", () => {
  assert.equal(
    count(nothingReturnedCheck, "function find(id: string): User | null { return u; }"),
    0,
    "a private helper is not a promise to anyone else",
  );
});

test("naming both answers is the legal spelling", () => {
  const named = `export type Found = { kind: "found"; user: User } | { kind: "none" };
export function find(id: string): Found { return { kind: "none" }; }`;
  assert.equal(count(nothingReturnedCheck, named), 0);
});

test("throwing when absence is a failure is the other legal spelling", () => {
  assert.equal(
    count(nothingReturnedCheck, "export function find(id: string): User { throw new NotFound(id); }"),
    0,
  );
});

test("a function that exists but does nothing is caught", () => {
  assert.equal(count(unfinishedCheck, "export function send(order: Order) {}"), 1);
  assert.equal(count(unfinishedCheck, "const send = (order: Order) => {};"), 1);
});

test("saying it is not built yet, in a way that compiles, is caught", () => {
  assert.equal(
    count(unfinishedCheck, "export function send() {\n  throw new Error('not implemented');\n}"),
    1,
  );
  assert.equal(
    count(unfinishedCheck, "export function send() {\n  throw new Error('TODO: wire this up');\n}"),
    1,
  );
});

test("a function that does something real is untouched", () => {
  assert.equal(count(unfinishedCheck, "export function send(o: Order) { queue.push(o); }"), 0);
});

test("a typed error that happens to mention a word is not a stub", () => {
  assert.equal(
    count(unfinishedCheck, "export function send() { throw new PaymentDeclined(id); }"),
    0,
  );
});

const SPELLINGS: readonly (readonly [Check, string, number])[] = [
  [nothingReturnedCheck, "export default function f(): string | null { return null; }", 1],
  [nothingReturnedCheck, "type Maybe = string | null;\nexport function f(): Maybe { return null; }", 1],
  [nothingReturnedCheck, "export async function f(): Promise<User | null> { return u; }", 1],
  [nothingReturnedCheck, "export function f(): Box<string | null> { return b; }", 0],
  [writtenAnyCheck, "type Loose = any;", 1],
  [writtenAnyCheck, "function f<T = any>(v: T): T { return v; }", 1],
  [stubValueCheck, 'function f(){ try { g(); } catch { return void 0; } }', 1],
  [stubValueCheck, 'function f(){ try { g(); } catch { return NaN; } }', 1],
  [stubValueCheck, 'function f(){ try { return g(); } catch { return {} as User; } }', 1],
  [stubValueCheck, 'const p = g().then((x) => x, () => null);', 1],
  [stubValueCheck, 'const swallow = () => [];\nconst p = g().catch(swallow);', 1],
  [anonymousProvenanceCheck, 'export * as types from "./types.ts";', 1],
  [silentMangleCheck, "const n = s >> 0;", 1],
  [silentMangleCheck, "const n = s >> 2;", 0],
  [unfinishedCheck, "export function f(): void { return; }", 1],
  [unfinishedCheck, "class A { constructor(private readonly x: number) {} }", 0],
  [unfinishedCheck, "class A { private constructor() {} }", 0],
  [droppedPromisesCheck, "async function save(i) { await write(i); }\nitems.forEach(save);", 1],
  [droppedPromisesCheck, "async function save(i) { await write(i); }\nitems.forEach((i) => save(i));", 1],
  [droppedPromisesCheck, "function tally(i) { total += i; }\nitems.forEach(tally);", 0],
];

test("a rule reads the act, not one spelling of it", () => {
  for (const [check, code, expected] of SPELLINGS) {
    assert.equal(countIn(check, code), expected, `wanted ${expected} for: ${code}`);
  }
});
