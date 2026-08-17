import { test } from "node:test";
import assert from "node:assert/strict";

import { countIn } from "./helpers.ts";
import type { Check } from "../src/law/engine.ts";
import { builtQueryCheck } from "../src/law/data/injection.ts";
import { builtCommandCheck } from "../src/law/node/command.ts";
import { clientSecretCheck } from "../src/law/next/client-secret.ts";
import { uncheckedInputCheck } from "../src/law/data/unchecked-input.ts";

const count = countIn;

test("a query with a value pasted into it is caught", () => {
  assert.equal(
    count(builtQueryCheck, "db.query(`SELECT * FROM orders WHERE id = ${id}`);"),
    1,
  );
  assert.equal(
    count(builtQueryCheck, 'db.query("SELECT * FROM orders WHERE id = " + id);'),
    1,
  );
  assert.equal(count(builtQueryCheck, "client.execute(`DELETE FROM users WHERE id = ${id}`);"), 1);
});

test("a tagged template is safe, because the library keeps the value separate", () => {
  assert.equal(
    count(builtQueryCheck, "sql`SELECT * FROM orders WHERE id = ${id}`;"),
    0,
    "the tag is the escaping; flagging it would teach people to avoid the safe spelling",
  );
});

test("passing the value separately is the legal spelling", () => {
  assert.equal(
    count(builtQueryCheck, "db.query('SELECT * FROM orders WHERE id = $1', [id]);"),
    0,
  );
});

test("a template with nothing pasted in is just a long string", () => {
  assert.equal(count(builtQueryCheck, "db.query(`SELECT * FROM orders`);"), 0);
});

test("a call named query that is not SQL is left alone", () => {
  assert.equal(
    count(builtQueryCheck, "cache.get(`user-${id}`);"),
    0,
    "the text has to look like a query, or every cache key in the project fires",
  );
});

test("a command with a value pasted into it is caught", () => {
  assert.equal(count(builtCommandCheck, "exec(`convert ${input} ${output}`);"), 1);
  assert.equal(count(builtCommandCheck, 'execSync("git clone " + url);'), 1);
});

test("passing the arguments as arguments is the legal spelling", () => {
  assert.equal(count(builtCommandCheck, "execFile('convert', [input, output]);"), 0);
  assert.equal(count(builtCommandCheck, "spawn('git', ['clone', url]);"), 0);
});

test("a fixed command with nothing pasted in is fine", () => {
  assert.equal(count(builtCommandCheck, "execSync('git status');"), 0);
});

test("a secret read in a file that runs in the browser is caught", () => {
  const leaking = `"use client";

export function Map() {
  const key = process.env.MAPBOX_SECRET_KEY;
  return key;
}`;
  assert.equal(count(clientSecretCheck, leaking, "src/Map.tsx"), 1);
});

test("a setting named public is meant to be public", () => {
  const fine = `"use client";

export function Map() {
  const style = process.env.NEXT_PUBLIC_MAP_STYLE;
  return style;
}`;
  assert.equal(count(clientSecretCheck, fine, "src/Map.tsx"), 0);
});

test("the same read on the server is a different question entirely", () => {
  const server = `export function load() {
  return process.env.MAPBOX_SECRET_KEY;
}`;
  assert.equal(
    count(clientSecretCheck, server, "src/load.ts"),
    0,
    "on the server this is TS-TRUTH:2's business, not this rule's",
  );
});

test("the words use client in ordinary text do not make a client file", () => {
  const text = `export const note = "use client";
export function load() {
  return process.env.SECRET;
}`;
  assert.equal(count(clientSecretCheck, text, "src/a.ts"), 0);
});

test("what arrived from outside, used without checking, is caught", () => {
  assert.equal(
    count(uncheckedInputCheck, "export async function POST(request) {\n  const body = await request.json();\n  await db.insert(orders).values(body);\n}"),
    1,
  );
});

test("checking it as it arrives is the legal spelling", () => {
  assert.equal(
    count(uncheckedInputCheck, "export async function POST(request) {\n  const order = OrderSchema.parse(await request.json());\n  await db.insert(orders).values(order);\n}"),
    0,
  );
});

test("checking it on the next line counts too", () => {
  assert.equal(
    count(uncheckedInputCheck, "export async function POST(request) {\n  const body = await request.json();\n  const order = OrderSchema.safeParse(body);\n}"),
    0,
  );
});

test("form data and text arrive from outside just the same", () => {
  assert.equal(
    count(uncheckedInputCheck, "const form = await request.formData();\nsave(form);"),
    1,
  );
});

test("something read from your own program is not something that arrived", () => {
  assert.equal(count(uncheckedInputCheck, "const rows = await db.select();\nsend(rows);"), 0);
});

const ARRIVALS: readonly (readonly [string, number])[] = [
  ["async function f(){ const b = await response.json(); return b.id; }", 1],
  ["async function f(){ let b; b = await response.json(); return b.id; }", 1],
  ["async function f(){ return await response.json(); }", 1],
  ["async function f(req){ const { id } = await req.json(); return id; }", 1],
  ["async function f(req){ return save(await req.json()); }", 1],
  ["async function f(req){ this.body = await req.json(); }", 1],
  ["async function f(req){ const b = await req.formData(); return b.get('id'); }", 1],
  ["async function f(res){ await res.text(); return retry(); }", 0],
  ["async function f(req){ return OrderSchema.parse(await req.json()); }", 0],
  ["async function f(req){ const b = await req.json(); return S.parse(b); }", 0],
  ["async function f(req){ const b = await req.json(); return S.safeParse(b); }", 0],
];

test("DATA:2 sees what arrived however it was caught, and only what is used", () => {
  for (const [code, expected] of ARRIVALS) {
    assert.equal(
      count(uncheckedInputCheck, code),
      expected,
      `wanted ${expected} for: ${code}`,
    );
  }
});

const THROUGH_A_NAME: readonly (readonly [string, number])[] = [
  ['const rows = db.query("SELECT * FROM users WHERE id = " + id);', 1],
  ['const q = "SELECT * FROM users WHERE id = " + id;\nconst rows = db.query(q);', 1],
  ['const base = "SELECT * FROM t WHERE id = " + id;\nconst q = base;\nconst rows = db.query(q);', 1],
  ['const rows = db.query("SELECT * FROM users WHERE id = $1", [id]);', 0],
  ['const label = `user ${id}`;\nconst rows = db.query(label);', 0],
];

test("DATA:1 follows a query that was given a name first", () => {
  for (const [code, expected] of THROUGH_A_NAME) {
    assert.equal(count(builtQueryCheck, code), expected, `wanted ${expected} for: ${code}`);
  }
});

const COMMANDS: readonly (readonly [string, number])[] = [
  ['exec("ls " + dir);', 1],
  ['const cmd = "ls " + dir;\nexecSync(cmd);', 1],
  ['spawn(`ls ${dir}`, { shell: true });', 1],
  ['spawn("git", ["clone", url]);', 0],
  ['execFile("convert", [input, output]);', 0],
  ['const greeting = `hello ${name}`;\nlogger.info(greeting);', 0],
];

test("NODE:1 follows a command that was given a name, and sees a shell asked for", () => {
  for (const [code, expected] of COMMANDS) {
    assert.equal(count(builtCommandCheck, code), expected, `wanted ${expected} for: ${code}`);
  }
});
